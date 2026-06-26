//#region constants
const APP_VERSION = '25.6.0'
const BASE_URL = 'https://nebula.tv/'
const PLATFORM = 'Nebula'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
const ACCEPT_JSON = 'application/json, text/plain, */*'
const PLATFORM_CLAIMTYPE = 19;

const CONTENT_REGEX = /^https:\/\/nebula\.tv\/videos\/([a-zA-Z0-9-_]+)\/?$/
const EPISODE_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)\/?$/
const CLASS_LESSON_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[0-9]+)$/
const CLASS_PLAYLIST_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[0-9]+)\?tab=lessons$/
const USER_PLAYLISTS_REGEX = /^https:\/\/nebula\.tv\/library\/(saved-episodes|watch-later)$/
const PLAYLIST_REGEX = /^https:\/\/content\.api\.nebula\.app\/video_playlists\/(video_playlist:[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})\/video_episodes\/$/
const CHANNEL_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+)\/?$/

const IS_DESKTOP = bridge.buildPlatform === "desktop";
//#endregion

let local_settings

let state = {
    token: null,
    lastContentDetails: { url: null, value: null }
}

//#region source methods
source.enable = function (_config, settings, savedState) {
    local_settings = settings
    if (savedState) {
        const saved = JSON.parse(savedState)
        if (saved.token) state.token = saved.token
    }
    if (!state.token) {
        state.token = getToken()
    }
}
source.saveState = function () {
    // Only the token needs to persist; settings come from enable() and lastContentDetails is a runtime cache.
    return JSON.stringify({ token: state.token })
}
source.getHome = function () {
    return new HomePager({ next: null })
}
source.getSearchCapabilities = () => {
    // Nebula search is relevance-ranked: it honors no ordering or filters (its web app sends none).
    return {
        types: [Type.Feed.Mixed],
        sorts: [],
        filters: [],
    }
}
source.search = function (query, type, order, filters) {
    const encodedQuery = encodeURIComponent(query)
    return new SearchPager({
        videoNext: `https://content.api.nebula.app/video_episodes/search/?include=&q=${encodedQuery}`,
        podcastNext: `https://content.api.nebula.app/podcast_episodes/search/?q=${encodedQuery}`
    })
}
source.searchChannels = function (query) {
    const encodedQuery = encodeURIComponent(query)
    return new SearchPagerChannels({
        next: `https://content.api.nebula.app/video_channels/search/?include=&q=${encodedQuery}`,
        podcastNext: `https://content.api.nebula.app/podcast_channels/search/?q=${encodedQuery}`
    })
}
source.isChannelUrl = function (url) {
    return CHANNEL_REGEX.test(url)
}
source.getChannel = function (url) {
    const login = lastPathSegment(url)

    /** @type {import("./types.d.ts").Channel} */
    const channel = getJson(`https://content.api.nebula.app/content/${login}`)

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, channel.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: channel.title,
        thumbnail: channel.images !== undefined ? channel.images.avatar.src : channel.assets["stripped-original"],
        banner: channel.images?.banner?.src,
        subscribers: -1,
        description: channel.description,
        url: `${BASE_URL}${login}`,
        links: getChannelLinks(channel),
    })
}
source.getChannelContents = function (url) {
    /** @type {import("./types.d.ts").Channel} */
    const channel = getJson(`https://content.api.nebula.app/content/${lastPathSegment(url)}`)

    return new ChannelVideoPager({ next: null, id: channel.id, type: channel.type })
}
source.getChannelPlaylists = function (url) {
    const slug = url.match(CHANNEL_REGEX)[1]
    const response = getJson(`https://content.api.nebula.app/content/${slug}`)
    return new PlaylistPager(
        response.playlists?.map(function (playlist) {
            return new PlatformPlaylist({
                id: new PlatformID(PLATFORM, playlist.id, plugin.config.id, PLATFORM_CLAIMTYPE),
                name: playlist.title,
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, slug, plugin.config.id, PLATFORM_CLAIMTYPE),
                    response.title,
                    `${BASE_URL}${response.slug}`,
                    response.images?.avatar?.src
                ),
                url: `https://content.api.nebula.app/video_playlists/${playlist.id}/video_episodes/`,
                thumbnail: response.images?.featured?.src || response.images?.avatar?.src
            })
        }),
        false
    )
}
source.getChannelTemplateByClaimMap = () => {
    return {
        //Nebula
        19: {
            0: BASE_URL + "{{CLAIMVALUE}}"
        }
    };
};

source.isContentDetailsUrl = function (url) {
    return CONTENT_REGEX.test(url) || EPISODE_REGEX.test(url) || CLASS_LESSON_REGEX.test(url)
}
source.getContentDetails = function (url) {
    /** @type {import("./types.d.ts".ContentDetail)} */
    const content = downloadContentDetails(url)

    const manifestType = content.type === "lesson" ? "lessons" : "video_episodes"
    const manifest_url = `https://content.api.nebula.app/${manifestType}/${content.id}/manifest.m3u8?token=${state.token}&app_version=${APP_VERSION}&platform=web`

    // Access isn't pre-verified here; a gated video surfaces its error when getSubtitles/playback fetches the manifest

    const details = contentToPlatformVideoDetails(content, manifest_url)

    details.getContentRecommendations = function () {
        return new ContentRecommendationsPager({ videoId: content.id, next: null })
    }

    return details;
}

source.getUserSubscriptions = function () {
    const endpoints = [
        "https://content.api.nebula.app/video_channels/?following=true&ordering=-follow",
        "https://content.api.nebula.app/podcast_channels/?following=true&ordering=-follow"
    ]
    // First page of both feeds in parallel; paginate any remainder sequentially
    const channels = []
    batchGetJson(endpoints.map((url) => ({ url, auth: true }))).forEach((page) => {
        channels.push(...page.results)
        if (page.next !== null) channels.push(...collectPages(page.next))
    })
    return channels.map((channel) => `${BASE_URL}${channel.slug}`)
}
source.isPlaylistUrl = function (url) {
    return PLAYLIST_REGEX.test(url)
        || USER_PLAYLISTS_REGEX.test(url)
        || CLASS_PLAYLIST_REGEX.test(url)
}
source.getPlaylist = function (url) {
    if (CLASS_PLAYLIST_REGEX.test(url)) {
        const classId = url.match(CLASS_PLAYLIST_REGEX)[1]
        const classMetadata = getJson(`https://content.api.nebula.app/content/${classId}/`)
        return new PlatformPlaylistDetails({
            id: new PlatformID(
                PLATFORM,
                classMetadata.class_id,
                plugin.config.id,
                PLATFORM_CLAIMTYPE
            ),
            name: classMetadata.class.title,
            author: new PlatformAuthorLink(
                new PlatformID(
                    PLATFORM,
                    classMetadata.class.creator,
                    plugin.config.id,
                    PLATFORM_CLAIMTYPE
                ),
                classMetadata.class.creator,
                classMetadata.class.creator
            ),
            datetime: unixSeconds(classMetadata.class.published_at),
            url,
            videoCount: classMetadata.class.lesson_count,
            thumbnail: classMetadata.class.images.featured.src,
            contents: new VideoPager(classMetadata.class.lessons.map((function (lesson) {
                lesson.class = {
                    creator: classMetadata.class.creator,
                    published_at: classMetadata.class.published_at
                }
                return contentToPlatformVideo(lesson)
            })), false)
        })
    } else if (USER_PLAYLISTS_REGEX.test(url)) {
        if (!bridge.isLoggedIn() && !state.token) {
            throw new ScriptLoginRequiredException("Nebula user playlists are only available after login")
        }
        const playlistType = url.match(USER_PLAYLISTS_REGEX)[1]
        // The user-account endpoint needs the login session (bridge auth), not just the bearer token.
        // Username is only the playlist author label, so a failure here must not break playlist import.
        let username = "Nebula User"
        try {
            const userData = getJson("https://users.api.nebula.app/api/v1/auth/user/", { auth: true, useLogin: true })
            username = userData.name === "" ? userData.email : userData.name
        } catch (_error) { /* username unavailable; keep the fallback */ }
        const userPlaylistInfo = function () {
            switch (playlistType) {
                case "watch-later": {
                    return {
                        url: "https://content.api.nebula.app/user_playlists/watch-later/video_episodes/?ordering=-added_to_playlist",
                        name: "Watch Later"
                    }
                }
                case "saved-episodes": {
                    return {
                        url: "https://content.api.nebula.app/user_podcast_playlists/saved-episodes/podcast_episodes/?ordering=-added_to_playlist",
                        name: "Saved Episodes"
                    }
                }
                default:
                    throw new ScriptException("unreachable")
            }
        }()
        // watch-later / saved-episodes are paginated; collect all pages (used during playlist import)
        const results = collectPages(userPlaylistInfo.url)
        return new PlatformPlaylistDetails({
            id: new PlatformID(PLATFORM, playlistType, plugin.config.id, PLATFORM_CLAIMTYPE),
            name: userPlaylistInfo.name,
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, username, plugin.config.id, PLATFORM_CLAIMTYPE),
                username,
                username
            ),
            url,
            videoCount: results.length,
            contents: new VideoPager(
                results.map(((video) => contentToPlatformVideo(video))),
                false
            )
        })
    } else {
        const playlistId = url.match(PLAYLIST_REGEX)[1]

        const response = getJson(url)
        const firstVideo = response.results[0]
        const channelResponse = getJson(`https://content.api.nebula.app/content/${firstVideo.channel_slug}`)
        const playlist = channelResponse.playlists.find((playlist) => playlist.id === playlistId)

        return new PlatformPlaylistDetails({
            id: new PlatformID(PLATFORM, playlistId, plugin.config.id, PLATFORM_CLAIMTYPE),
            name: playlist.title,
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, firstVideo.channel_slug, plugin.config.id, PLATFORM_CLAIMTYPE),
                channelResponse.title,
                `${BASE_URL}${channelResponse.slug}`,
                channelResponse.images.avatar.src
            ),
            url,
            videoCount: response.results.length, // there may be more but this is a good guess
            contents: new PlaylistContentsPager(
                response.results,
                response.next
            )
        })
    }
}
source.searchPlaylists = function (query) {
    const encodedQuery = encodeURIComponent(query)
    return new SearchPlaylistsPager({
        classNext: `https://content.api.nebula.app/classes/search/?q=${encodedQuery}`,
        seriesNext: `https://content.api.nebula.app/video_playlists/search/?q=${encodedQuery}&video_playlist_type=miniseries`
    })
}
source.getUserPlaylists = function () {
    return [
        "https://nebula.tv/library/watch-later",
        "https://nebula.tv/library/saved-episodes",
        ...getSavedClasses()
    ]
}
source.getContentRecommendations = function (url) {
    const contentMetadata = downloadContentDetails(url)
    return new ContentRecommendationsPager({ videoId: contentMetadata.id, next: null })
}
source.getPlaybackTracker = function (url) {
    if (!local_settings.nebulaActivity) {
        return null
    }
    const contentMetadata = downloadContentDetails(url)
    switch (contentMetadata.type) {
        case "lesson":
            return new NebulaPlaybackTracker(`https://content.api.nebula.app/lessons/${contentMetadata.id}/progress/`, contentMetadata.duration)
        case "podcast_episode":
            return new NebulaPlaybackTracker(`https://content.api.nebula.app/podcast_episodes/${contentMetadata.id}/progress/`, contentMetadata.duration)
        case "video_episode":
            return new NebulaPlaybackTracker(`https://content.api.nebula.app/video_episodes/${contentMetadata.id}/progress/`, contentMetadata.duration)
        default:
            throw new ScriptException("unreachable")
    }
}
//#endregion

//#region internals
class NebulaPlaybackTracker extends PlaybackTracker {
    constructor(url, duration) {
        super(15 * 1000)
        this.url = url
        this.duration = duration
    }
    onInit(_seconds) {
        trackProgress(this.url, 1)
    }
    onProgress(seconds, isPlaying) {
        if (!isPlaying || seconds === 0) {
            return
        }
        trackProgress(this.url, seconds)
    }
    onConcluded() {
        trackProgress(this.url, this.duration)
    }
}
function trackProgress(url, seconds) {
    const response = http.requestWithBody(
        "PATCH",
        url,
        JSON.stringify({ value: seconds }),
        {
            Authorization: `Bearer ${state.token}`,
            "Content-Type": "application/json"
        },
        false)
    log(`Nebula trackProgress PATCH ${url} -> ${response.code}`)
}
function downloadContentDetails(url) {
    if (!bridge.isLoggedIn() && !state.token)
        throw new ScriptLoginRequiredException("Nebula videos are only available after login")

    // Playback opens call this 3x for the same url (details + tracker + recommendations); memoize the last lookup.
    if (state.lastContentDetails.url === url) return state.lastContentDetails.value

    let contentUrl
    if (CONTENT_REGEX.test(url)) {
        // video: /videos/<slug>
        contentUrl = `https://content.api.nebula.app/content/videos/${url.match(CONTENT_REGEX)[1]}`
    } else if (EPISODE_REGEX.test(url)) {
        // channel episode or podcast episode: /<channel>/<slug>
        contentUrl = `https://content.api.nebula.app/content/${url.match(EPISODE_REGEX)[1]}`
    } else if (CLASS_LESSON_REGEX.test(url)) {
        // class lesson: /<class>/<number>
        contentUrl = `https://content.api.nebula.app/content/${url.match(CLASS_LESSON_REGEX)[1]}/`
    } else {
        throw new ScriptException("Unsupported Nebula content URL: " + url)
    }

    /** @type {import("./types.d.ts".ContentDetail)} */
    state.lastContentDetails = { url, value: getJson(contentUrl, { auth: true }) }
    return state.lastContentDetails.value
}
function getSavedClasses() {
    const classes = collectPages("https://content.api.nebula.app/classes/?following=true&include=lessons")
    return classes.map((nebulaClass) => `${nebulaClass.share_url}1?tab=lessons`)
}
/**
 * Standard headers sent on every Nebula request (mirrors the web client)
 * @param {string} url
 * @returns {Object}
 */
function standardHeaders(url) {
    return {
        'User-Agent': USER_AGENT,
        Accept: ACCEPT_JSON,
        DNT: '1',
        Origin: 'https://nebula.tv',
        Host: url.split('/')[2]
    }
}
/**
 * Standard headers plus the bearer token and Nebula app identifiers, for authenticated API calls
 * @param {string} url
 * @param {Object} [extra] additional headers to merge in
 * @returns {Object}
 */
function authHeaders(url, extra) {
    return Object.assign(
        standardHeaders(url),
        {
            Authorization: `Bearer ${state.token}`,
            'Nebula-App-Version': APP_VERSION,
            'Nebula-Platform': 'web'
        },
        extra ?? {}
    )
}
/**
 * Throws a descriptive exception for a failed Nebula response
 * @param {Object} resp the http response
 * @throws {ScriptException}
 */
function checkResponse(response) {
    if (response.isOk) return
    if (response.code === 401) {
        throw new UnavailableException('Video is only available to Nebula Subscribers')
    }
    if (response.code === 403) {
        throw new ScriptLoginRequiredException("Nebula login may have expired, please login again, this should be mostly automatic.")
    }
    throw new ScriptException(`${response.statusMessage} (code: ${response.code})`)
}
/**
 * Validates a response and parses it as JSON, throwing on Nebula error payloads
 * @param {Object} resp the http response
 * @returns {any} the parsed json object
 * @throws {ScriptException}
 */
function parseJson(response) {
    checkResponse(response)
    const json = JSON.parse(response.body)
    if (json.errors) {
        throw new ScriptException(json.errors[0].message)
    }
    return json
}
/**
 * GET returning parsed JSON, with Nebula error handling.
 * @param {string} url
 * @param {Object} [options]
 * @param {boolean} [options.auth] send the bearer token + Nebula app headers (for user-specific or gated
 *   endpoints). Omit for public endpoints (home, search, channel, class search) so a stale saved token
 *   can't break browsing — Nebula returns 403 for an invalid bearer but 200 for no bearer.
 * @param {boolean} [options.useLogin] also send Grayjay's stored login session (cookies); needed by the user-account endpoint.
 * @param {Object} [options.headers] additional headers to merge in.
 * @returns {any} the parsed json object
 * @throws {ScriptException}
 */
function getJson(url, { auth = false, useLogin = false, headers } = {}) {
    function buildHeaders() {
        if (auth) {
            return authHeaders(url, headers)
        }
        return Object.assign(standardHeaders(url), headers ?? {})
    }
    let response = http.GET(url, buildHeaders(), useLogin)
    // A 403 on an authenticated request means the token is stale/invalid — refresh once and retry.
    if (auth && response.code === 403) {
        state.token = getToken()
        response = http.GET(url, buildHeaders(), useLogin)
    }
    return parseJson(response)
}
/**
 * GET returning the raw response body (e.g. an HLS playlist or VTT). No bearer token.
 * @param {string} url
 * @param {Object} [extraHeaders]
 * @returns {string} the response body
 * @throws {ScriptException}
 */
function getText(url, extraHeaders) {
    const response = http.GET(url, Object.assign(standardHeaders(url), extraHeaders ?? {}), false)
    checkResponse(response)
    return response.body
}
/**
 * Collects results across every page of a paginated (authenticated) Nebula list endpoint
 * @param {string} url the first page url
 * @returns {any[]} flattened results from all pages
 */
function collectPages(url) {
    const results = []
    let next = url
    while (next !== null) {
        const page = getJson(next, { auth: true })
        results.push(...page.results)
        next = page.next
    }
    return results
}
/**
 * Fires multiple GETs in parallel and returns their parsed JSON bodies, in request order.
 * @param {{url: string, auth?: boolean}[]} requests
 * @returns {any[]}
 */
function batchGetJson(requests) {
    function send() {
        const builder = http.batch()
        for (const request of requests) {
            const headers = request.auth ? authHeaders(request.url) : standardHeaders(request.url)
            builder.GET(request.url, headers, false)
        }
        return builder.execute()
    }
    let responses = send()
    // Refresh the token once and re-run if any authenticated request hit a stale-token 403.
    const hasStaleAuth = responses.some((response, index) => requests[index].auth && response && response.code === 403)
    if (hasStaleAuth) {
        state.token = getToken()
        responses = send()
    }
    return responses.map((response) => parseJson(response))
}
/**
 * Extracts the URI of the first EXT-X-MEDIA entry of the given type from an HLS master manifest
 * @param {string} manifestBody
 * @param {string} type e.g. "SUBTITLES"
 * @returns {string | null}
 */
function getHlsMediaUri(manifestBody, type) {
    const mediaLine = manifestBody
        .split('\n')
        .find((line) => line.startsWith('#EXT-X-MEDIA:') && line.includes(`TYPE=${type}`))
    if (!mediaLine) return null
    const match = mediaLine.match(/URI="([^"]+)"/)
    return match ? match[1] : null
}
/**
 * Returns the last non-comment segment line of an HLS media playlist ending with the extension
 * @param {string} playlistBody
 * @param {string} extension e.g. ".vtt"
 * @returns {string | null}
 */
function getHlsSegment(playlistBody, extension) {
    const segment = playlistBody
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.endsWith(extension))
        .pop()
    return segment ?? null
}
/**
 * Resolves a (possibly relative) HLS URI against a base directory URL
 * @param {string} baseDir base URL ending in '/'
 * @param {string} uri absolute or relative URI
 * @returns {string}
 */
function resolveHlsUri(baseDir, uri) {
    if (uri.startsWith('http')) return uri
    return baseDir + uri
}
/**
 * Extracts the English WebVTT subtitle content by walking the HLS manifest chain:
 * master manifest -> EXT-X-MEDIA SUBTITLES playlist -> .vtt segment.
 * @param {string} manifestUrl the master HLS manifest url
 * @returns {string | null} the WebVTT content, or null if no subtitles are available
 */
function fetchSubtitleVtt(manifestUrl) {
    // Fetched directly (not via getText) because we need the redirected response url
    const manifestResponse = http.GET(manifestUrl, {}, false)

    // Resolve relative HLS URIs against the manifest's directory (CDN-agnostic)
    const cleanUrl = manifestResponse.url.split('?')[0].split('#')[0]
    const lastSlash = cleanUrl.lastIndexOf('/')
    if (lastSlash === -1) return null
    const prefix = cleanUrl.slice(0, lastSlash + 1)

    const subtitleUri = getHlsMediaUri(manifestResponse.body, 'SUBTITLES')
    if (!subtitleUri) return null

    const subtitlePlaylistUrl = resolveHlsUri(prefix, subtitleUri)
    const vttFile = getHlsSegment(getText(subtitlePlaylistUrl), '.vtt')
    if (!vttFile) return null

    // The .vtt is relative to the subtitle playlist's directory
    const subtitleBase = subtitlePlaylistUrl.slice(0, subtitlePlaylistUrl.lastIndexOf('/') + 1)
    return getText(resolveHlsUri(subtitleBase, vttFile))
}
/**
 * Gets an authorization token
 * @returns {string} the token
 */
function getToken() {
    const response = http.POST(
        'https://users.api.nebula.app/api/v1/authorization/',
        '',
        {
            Accept: 'application/json',
            DNT: '1',
            Host: 'users.api.nebula.app',
            'Nebula-App-Version': APP_VERSION,
            'Nebula-Platform': 'web',
            Origin: 'https://nebula.tv',
            'User-Agent': USER_AGENT,
        },
        true
    )

    const tokenResponse = JSON.parse(response.body)

    return tokenResponse.token
}
/**
 * Converts a date string to whole Unix seconds
 * @param {string} dateString
 * @returns {number}
 */
function unixSeconds(dateString) {
    return parseInt(new Date(dateString).getTime() / 1000)
}
/**
 * Returns the last non-empty path segment of a url (e.g. the channel slug)
 * @param {string} url
 * @returns {string}
 */
function lastPathSegment(url) {
    return url.split('/').filter((segment) => segment !== '').pop()
}
/**
 * Gets a list of links from a channel object
 * @param {import("./types.d.ts").Channel} c
 * @returns {string[]}
 */
function getChannelLinks(channel) {
    const keys = ['website', 'patreon', 'twitter', 'instagram', 'facebook', 'merch', 'share_url']

    const links = {}

    keys.forEach((key) => {
        if (!channel[key]) return
        let label
        if (key === 'share_url') {
            label = 'Nebula'
        } else {
            label = key.charAt(0).toUpperCase() + key.slice(1)
        }
        links[label] = channel[key]
    })

    return links
}
//#endregion

//#region pagers
class HomePager extends VideoPager {
    /**
     * @param {import("./types.d.ts").HomeContext} context
     */
    constructor(context) {
        let url = `https://content.api.nebula.app/video_episodes/?ordering=-published_at`
        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").HomeResponse} */
        const response = getJson(url)

        const results = response.results.map((content) => contentToPlatformVideo(content))

        context.next = response.next

        super(results, context.next !== null, context)
    }

    nextPage() {
        this.context.page++
        return new HomePager(this.context)
    }
}
class ChannelVideoPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").ChannelContext} context the context
     */
    constructor(context) {
        const isVideoChannel = context.type === "video_channel"
        let url = isVideoChannel
            ? `https://content.api.nebula.app/video_channels/${context.id}/video_episodes/?ordering=-published_at`
            : `https://content.api.nebula.app/podcast_channels/${context.id}/podcast_episodes/?ordering=-published_at`

        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").ChannelContentResponse} */
        const response = getJson(url, { auth: !isVideoChannel })

        const results = response.results.map((content) => contentToPlatformVideo(content))

        context.next = response.next

        super(results, response.next !== null, context)
    }
    nextPage() {
        return new ChannelVideoPager(this.context)
    }
}
class SearchPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").SearchContext} context
     */
    constructor(context) {
        const pending = []
        if (context.videoNext !== null) pending.push({ key: "video", url: context.videoNext })
        if (context.podcastNext !== null) pending.push({ key: "podcast", url: context.podcastNext })

        /** @type {import("./types.d.ts").SearchResponse[]} */
        const responses = batchGetJson(pending)

        const results = []
        pending.forEach((request, index) => {
            const response = responses[index]
            results.push(...response.results.map((content) => contentToPlatformVideo(content)))
            if (request.key === "video") {
                context.videoNext = response.next
            } else {
                context.podcastNext = response.next
            }
        })

        super(results, context.videoNext !== null || context.podcastNext !== null, context)
    }
    nextPage() {
        return new SearchPager(this.context)
    }
}
class SearchPagerChannels extends ChannelPager {
    /**
     * Search channels
     * @param {import("./types.d.ts").SearchChannelContext} context the context
     */
    constructor(context) {
        const pending = []
        if (context.next !== null) pending.push({ key: "video", url: context.next })
        if (context.podcastNext !== null) pending.push({ key: "podcast", url: context.podcastNext })

        /** @type {import("./types.d.ts").SearchChannelResponse[]} */
        const responses = batchGetJson(pending)

        const results = []
        pending.forEach((request, index) => {
            const response = responses[index]
            results.push(...response.results.map((channel) => searchChannelToPlatformChannel(channel)))
            if (request.key === "video") {
                context.next = response.next
            } else {
                context.podcastNext = response.next
            }
        })

        super(results, context.podcastNext !== null || context.next !== null, context)
    }
    nextPage() {
        return new SearchPagerChannels(this.context)
    }
}
/**
 * Fetches one page of merged class + miniseries playlist search results,
 * advancing the context's classNext/seriesNext cursors.
 * @param {{classNext: string|null, seriesNext: string|null}} context
 * @returns {PlatformPlaylist[]}
 */
function fetchSearchPlaylistsPage(context) {
    const pending = []
    if (context.classNext !== null) pending.push({ key: "class", url: context.classNext })
    if (context.seriesNext !== null) pending.push({ key: "series", url: context.seriesNext })

    const responses = batchGetJson(pending)

    const results = []
    pending.forEach((request, index) => {
        const response = responses[index]
        if (request.key === "class") {
            results.push(...response.results.map(classToPlaylist))
            context.classNext = response.next
        } else {
            results.push(...response.results.map(seriesToPlaylist))
            context.seriesNext = response.next
        }
    })
    return results
}
class SearchPlaylistsPager extends PlaylistPager {
    constructor(context) {
        const results = fetchSearchPlaylistsPage(context)
        super(results, context.classNext !== null || context.seriesNext !== null)
        this.context = context
    }
    nextPage() {
        this.results = fetchSearchPlaylistsPage(this.context)
        this.hasMore = this.context.classNext !== null || this.context.seriesNext !== null
        return this
    }
    hasMorePagers() {
        return this.hasMore
    }
}
class PlaylistContentsPager extends VideoPager {
    constructor(results, next) {
        super(results.map(((video) => contentToPlatformVideo(video))), next !== null)
        this.next = next
    }
    nextPage() {
        const response = getJson(this.next)
        this.next = response.next
        this.results = response.results.map(((video) => contentToPlatformVideo(video)))
        this.hasMore = response.next !== null
        return this
    }
    hasMorePagers() {
        return this.hasMore
    }
}
class ContentRecommendationsPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").ContentRecommendationsContext} context
     */
    constructor(context) {
        let url = `https://content.api.nebula.app/video_episodes/${context.videoId}/more?context_view=featured&page_size=20`
        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").HomeResponse} */
        const response = getJson(url, { auth: true })

        const results = response.results.map((content) => contentToPlatformVideo(content))

        context.next = response.next

        super(results, context.next !== null, context)
    }

    nextPage() {
        return new ContentRecommendationsPager(this.context)
    }
}
//#endregion

//#region converters
/**
 * Convert a search channel to a platform channel
 * @param {import("./types.d.ts").Channel} c
 * @returns { PlatformChannel }
 */
function searchChannelToPlatformChannel(channel) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, channel.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: channel.title,
        thumbnail: channel.images === undefined ? channel.assets["stripped-original"] : channel.images.avatar.src,
        banner: channel.images?.banner?.src,
        subscribers: -1,
        description: channel.description,
        url: `${BASE_URL}${channel.slug}`,
        links: getChannelLinks(channel),
    })
}
/**
 * Convert a content object to a platform video
 * @param { import("./types.d.ts").Content } c
 * @returns { PlatformVideo }
 */
function contentToPlatformVideo(content) {
    const thumbnailUrl = content.images === undefined
        ? content.assets["stripped-original"]
        : content.images.thumbnail?.src
    const channelThumbnailUrl = content.images === undefined
        ? content.assets["stripped-original"]
        : content.images.channel_avatar?.src
    const author = content.class === undefined
        ? new PlatformAuthorLink(
            new PlatformID(PLATFORM, content.channel_id, plugin.config.id, PLATFORM_CLAIMTYPE),
            content.channel_title,
            BASE_URL + content.channel_slug,
            channelThumbnailUrl
        )
        : new PlatformAuthorLink(
            new PlatformID(PLATFORM, content.class.creator, plugin.config.id, PLATFORM_CLAIMTYPE),
            content.class.creator,
            content.class.creator
        )
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, content.id, plugin.config.id),
        name: content.title,
        thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl ?? channelThumbnailUrl, 0)]),
        author,
        uploadDate: unixSeconds(content.published_at === undefined ? content.class.published_at : content.published_at),
        duration: content.duration,
        viewCount: -1, // Nebula's API exposes no view count; -1 = unknown
        url: content.share_url,
        isLive: false,
    })
}
/**
 * Converts a saved video to a platform video
 * @param {import("./types.d.ts").Content} c
 * @param {string} manifest_url
 * @returns {PlatformVideoDetails}
 */
function contentToPlatformVideoDetails(content, manifest_url) {
    const platformVideo = contentToPlatformVideo(content)
    const videoDetails = new PlatformVideoDetails(platformVideo)
    videoDetails.description = content.description === undefined ? content.class.description : content.description
    // Nebula is English-only: no language metadata in the API, and HLS
    // manifests contain a single audio track with no alternate languages.
    if (content.type === "podcast_episode" || content.episode_url) {
        videoDetails.video = new UnMuxVideoSourceDescriptor([], [new AudioUrlSource({
            name: "English",
            bitrate: 128000,
            url: content.episode_url,
            language: "en"
        })])
    } else {

        if (IS_DESKTOP) {
            videoDetails.video = new VideoSourceDescriptor(
                [new HLSSource({ name: 'hls', duration: content.duration, url: manifest_url })]
            )
        } else {
            // workaround on mobile where some downloads (from playlists, watch later) don't have audio. However this creates issues on desktop playing content;
            videoDetails.video = new UnMuxVideoSourceDescriptor(
                [new HLSSource({ name: 'hls', duration: content.duration, url: manifest_url })],
                [new HLSSource({ name: 'hls', duration: content.duration, url: manifest_url, language: 'en' })]
            )
        }

        videoDetails.subtitles = [{
            name: "English",
            format: "text/vtt",
            getSubtitles() {
                return fetchSubtitleVtt(manifest_url)
            }
        }]
    }
    return videoDetails
}
function classToPlaylist(nebulaClass) {
    return new PlatformPlaylist({
        id: new PlatformID(PLATFORM, nebulaClass.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: nebulaClass.title,
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, nebulaClass.creator, plugin.config.id, PLATFORM_CLAIMTYPE),
            nebulaClass.creator,
            nebulaClass.creator
        ),
        datetime: unixSeconds(nebulaClass.published_at),
        url: `${nebulaClass.share_url}1?tab=lessons`,
        videoCount: nebulaClass.lesson_count,
        thumbnail: nebulaClass.images.featured.src
    })
}
/**
 * Converts a video_playlists (miniseries) search result to a platform playlist
 * @param {import("./types.d.ts").Content} series
 * @returns {PlatformPlaylist}
 */
function seriesToPlaylist(series) {
    return new PlatformPlaylist({
        id: new PlatformID(PLATFORM, series.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: series.title,
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, series.video_channel_slug, plugin.config.id, PLATFORM_CLAIMTYPE),
            series.video_channel_title,
            `${BASE_URL}${series.video_channel_slug}`
        ),
        url: series.video_episodes_url,
        videoCount: series.episodes_count,
        thumbnail: series.images?.cover?.src
    })
}
//#endregion

//#region tests
// Custom GrayjayTests entry (merged with the engine's standard tests at test time; unused in normal runtime).
var GrayjayTests = {
    Search: {
        name: "Search",
        description: "Searches videos/podcasts and playlists/series for the configured query, expecting results",
        requirements: ["DEFINED"],
        test(testContext) {
            const query = testContext.metadata.Search.query

            const content = testContext.runSourceMethod("search", [query, null, null, null]).results
            if (content.length === 0) throw "search returned no results for: " + query

            const playlists = testContext.runSourceMethod("searchPlaylists", [query]).results
            if (playlists.length === 0) throw "searchPlaylists returned no results for: " + query
        }
    }
}
//#endregion
