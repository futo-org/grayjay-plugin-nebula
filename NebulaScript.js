//#region constants
const APP_VERSION = '25.6.0'
const BASE_URL = 'https://nebula.tv/'
const PLATFORM = 'Nebula'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
const PLATFORM_CLAIMTYPE = 19;

const CONTENT_REGEX = /^https:\/\/nebula\.tv\/videos\/([a-zA-Z0-9-_]+)\/?$/
const EPISODE_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)\/?$/
const CLASS_LESSON_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[0-9]+)$/
const CLASS_PLAYLIST_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+\/[0-9]+)\?tab=lessons$/
const USER_PLAYLISTS_REGEX = /^https:\/\/nebula\.tv\/library\/(saved-episodes|watch-later)$/
const PLAYLIST_REGEX = /^https:\/\/content\.api\.nebula\.app\/video_playlists\/(video_playlist:[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})\/video_episodes\/$/
const CHANNEL_REGEX = /^https:\/\/nebula\.tv\/([a-zA-Z0-9-_]+)\/?$/

const HARDCODED_ZERO = 0
//#endregion

let token
let local_settings

//#region source methods
source.enable = function (_config, settings, savedState) {
    local_settings = settings
    if (!savedState) {
        token = getToken()
    } else {
        token = savedState
    }
}
source.saveState = function () {
    return token
}
source.getHome = function () {
    return new HomePager({ next: null })
}
// source.searchSuggestions = function (query) {
//     return []
// }
source.getSearchCapabilities = () => {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological, 'Oldest'],
        filters: [
            {
                id: 'exclusivity',
                name: 'Exclusivity',
                isMultiSelect: true,
                filters: [
                    { id: 'plus', name: 'Plus', value: 'plus' },
                    { id: 'first', name: 'First', value: 'first' },
                    { id: 'original', name: 'Original', value: 'original' },
                ],
            },
        ],
    }
}
source.search = function (query, type, order, filters) {
    return new SearchPager({ q: query, page: 1 })
}
// source.getSearchChannelContentsCapabilities = function () {
//     return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }
// }
source.searchChannels = function (query) {
    return new SearchPagerChannels({
        next: `https://content.api.nebula.app/video_channels/search/?include=&q=${query}`,
        podcastNext: `https://content.api.nebula.app/podcast_channels/search/?q=${query}`
    })
}
source.isChannelUrl = function (url) {
    return CHANNEL_REGEX.test(url)
}
source.getChannel = function (url) {
    const login = url
        .split('/')
        .filter((v) => v !== '')
        .pop()

    /** @type {import("./types.d.ts").Channel} */
    const j = callUrl(`https://content.api.nebula.app/content/${login}`)

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, j.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: j.title,
        thumbnail: j.images !== undefined ? j.images.avatar.src : j.assets["stripped-original"],
        banner: j.images?.banner.src,
        subscribers: -1,
        description: j.description,
        url: `${BASE_URL}${login}`,
        links: getChannelLinks(j),
    })
}
source.getChannelContents = function (url) {
    const login = url
        .split('/')
        .filter((v) => v !== '')
        .pop()

    /** @type {import("./types.d.ts").Channel} */
    const j = callUrl(`https://content.api.nebula.app/content/${login}`)

    return new ChannelVideoPager({ next: null, id: j.id, type: j.type })
}
source.getChannelPlaylists = function (url) {
    const slug = url.match(CHANNEL_REGEX)[1]
    const response = callUrl(`https://content.api.nebula.app/content/${slug}`)
    return new PlaylistPager(
        response.playlists?.map(function (playlist) {
            return new PlatformPlaylist({
                id: new PlatformID(PLATFORM, playlist.id, plugin.config.id, PLATFORM_CLAIMTYPE),
                name: playlist.title,
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, slug, plugin.config.id, PLATFORM_CLAIMTYPE),
                    response.title,
                    `${BASE_URL}${response.slug}`,
                    response.images.avatar.src
                ),
                url: `https://content.api.nebula.app/video_playlists/${playlist.id}/video_episodes/`
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
    const contentType = CONTENT_REGEX.test(url)
        ? "video"
        : (EPISODE_REGEX.test(url)
            ? "episode"
            : "lesson")

    /** @type {import("./types.d.ts".ContentDetail)} */
    const j = downloadContentDetails(url)

    const manifest_url = contentType === "video"
        ? `https://content.api.nebula.app/video_episodes/${j.id}/manifest.m3u8?token=${token}&app_version=${APP_VERSION}&platform=web`
        : `https://content.api.nebula.app/lessons/${j.id}/manifest.m3u8?token=${token}&app_version=${APP_VERSION}&platform=web`

    // callUrl(manifest_url, false, false) // this request verifies that the user has access to watch the video. If the user does not have access, the error checking in the callUrl method will throw an exception

    const details = contentToPlatformVideoDetails(j, manifest_url)

    details.getContentRecommendations = function (url) {
        return new ContentRecommendationsPager({ videoId: j.id, next: null })
    }

    return details;
}

source.getUserSubscriptions = function () {
    // TODO this isn't done in parallel but that is ok because this is an uncommon workflow
    /** @type {import("./types.d.ts").SubscriptionResponse} */
    let response = JSON.parse(http.GET(
        "https://content.api.nebula.app/video_channels/?following=true&ordering=-follow",
        {
            Authorization: `Bearer ${token}`
        },
        false
    ).body)

    const results = response.results.map((c) => `${BASE_URL}${c.slug}`)
    while (response.next !== null) {
        response = JSON.parse(http.GET(
            response.next,
            {
                Authorization: `Bearer ${token}`
            },
            false
        ).body)
        results.push(...response.results.map((c) => `${BASE_URL}${c.slug}`))
    }
    /** @type {import("./types.d.ts").SubscriptionResponse} */
    response = JSON.parse(http.GET(
        "https://content.api.nebula.app/podcast_channels/?following=true&ordering=-follow",
        {
            Authorization: `Bearer ${token}`
        },
        false
    ).body)

    results.push(...response.results.map((c) => `${BASE_URL}${c.slug}`))
    while (response.next !== null) {
        response = JSON.parse(http.GET(
            response.next,
            {
                Authorization: `Bearer ${token}`
            },
            false
        ).body)
        results.push(...response.results.map((c) => `${BASE_URL}${c.slug}`))
    }
    return results
}
// source.getComments = function (url) {
//     return new CommentPager([], false, {}) //Not implemented
// }
// source.getSubComments = function (comment) {
//     return new CommentPager([], false, {}) //Not implemented
// }
source.isPlaylistUrl = function (url) {
    return PLAYLIST_REGEX.test(url)
        || USER_PLAYLISTS_REGEX.test(url)
        || CLASS_PLAYLIST_REGEX.test(url)
}
source.getPlaylist = function (url) {
    if (CLASS_PLAYLIST_REGEX.test(url)) {
        const classId = url.match(CLASS_PLAYLIST_REGEX)[1]
        const classMetadata = callUrl(`https://content.api.nebula.app/content/${classId}/`)
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
            datetime: parseInt(new Date(classMetadata.class.published_at).getTime() / 1000),
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
        if (!bridge.isLoggedIn()) {
            throw new ScriptLoginRequiredException("Nebula user playlists are only available after login")
        }
        const playlistType = url.match(USER_PLAYLISTS_REGEX)[1]
        const userData = JSON.parse(http.GET(
            "https://users.api.nebula.app/api/v1/auth/user/",
            { Authorization: `Bearer ${token}` },
            false
        ).body)
        const username = userData.name === "" ? userData.email : userData.name
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
        const response = JSON.parse(http.GET(
            userPlaylistInfo.url,
            {
                Authorization: `Bearer ${token}`
            },
            false
        ).body)
        const results = response.results
        let next = response.next
        // we don't need to paginate because watch later and saved episodes should only be used during playlist import
        while (next !== null) {
            const response = JSON.parse(http.GET(
                next,
                {
                    Authorization: `Bearer ${token}`
                },
                false
            ).body)
            next = response.next
            results.push(...response.results)
        }
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

        const response = callUrl(url)
        const firstVideo = response.results[1]
        const channelResponse = callUrl(`https://content.api.nebula.app/content/${firstVideo.channel_slug}`)
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
    return new ClassSearchPager(query)
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
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        false)
}
function downloadContentDetails(url) {
    const contentType = CONTENT_REGEX.test(url)
        ? "video"
        : (EPISODE_REGEX.test(url)
            ? "episode"
            : "lesson")

    const id = function () {
        switch (contentType) {
            case "video":
                return url.match(CONTENT_REGEX)[1]
            case "episode":
                return url.match(EPISODE_REGEX)[1]
            case "lesson":
                return url.match(CLASS_LESSON_REGEX)[1]
            default:
                throw new ScriptException("unreachable")
        }
    }()

    if (!bridge.isLoggedIn())
        throw new ScriptLoginRequiredException("Nebula videos are only available after login");

    const contentUrl = function () {
        switch (contentType) {
            case "video":
                return `https://content.api.nebula.app/content/videos/${id}`
            case "episode":
                return `https://content.api.nebula.app/content/${id}`
            case "lesson":
                return `https://content.api.nebula.app/content/${id}/`
            default:
                throw new ScriptException("unreachable")
        }
    }()

    /** @type {import("./types.d.ts".ContentDetail)} */
    const j = function () {
        switch (contentType) {
            case "video":
                return callUrl(contentUrl, true)
            case "episode":
                return JSON.parse(http.GET(contentUrl, { Authorization: `Bearer ${token}` }).body)
            case "lesson":
                return JSON.parse(http.GET(contentUrl, { Authorization: `Bearer ${token}` }).body)
            default:
                throw new ScriptException("unreachable")
        }
    }()
    return j
}
function getSavedClasses() {
    const url = "https://content.api.nebula.app/classes/?following=true&include=lessons"
    const response = JSON.parse(http.GET(
        url,
        {
            Authorization: `Bearer ${token}`
        },
        false
    ).body)
    const results = response.results
    let next = response.next
    while (next !== null) {
        const response = JSON.parse(http.GET(
            url,
            {
                Authorization: `Bearer ${token}`
            },
            false
        ).body)
        next = response.next
        results.push(...response.results)
    }
    return results.map((nebulaClass) => `${nebulaClass.share_url}1?tab=lessons`)
}
/**
 * Gets the request url
 * @param {string} url the url to get
 * @param {boolean} use_authenticated if true, will use the authenticated headers
 * @param {boolean} parse if true, will parse the response as json and check for errors
 * @returns {string | Object} the response body as a string or the parsed json object
 * @throws {ScriptException}
 */
function callUrl(url, use_authenticated = false, parse_response = true) {
    const resp = http.GET(
        url,
        {
            'User-Agent': USER_AGENT,
            Accept: 'application/json, text/plain, */*',
            DNT: '1',
            Origin: 'https://nebula.tv',
            Host: url.split('/')[2]
        },
        use_authenticated
    )

    if (!resp.isOk) {
        // log(resp)
        if (resp.code === 401) {
            throw new UnavailableException('Video is only available to Nebula Subscribers')
        }
        else if (resp.code === 403) {
            throw new ScriptLoginRequiredException("Nebula login may have expired, please login again, this should be mostly automatic.");
        } else {
            throw new ScriptException(resp.statusMessage + "(code: " + resp.code + ")");
        }
    }

    if (parse_response) {
        const json = JSON.parse(resp.body)
        if (json.errors) {
            throw new ScriptException(json.errors[0].message)
        }
        return json
    }

    return resp.body
}
/**
 * Gets an authorization token
 * @returns {string} the token
 */
function getToken() {
    const resp = http.POST(
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

    const j = JSON.parse(resp.body)

    return j.token
}
/**
 * Gets a list of links from a channel object
 * @param {import("./types.d.ts").Channel} c
 * @returns {string[]}
 */
function getChannelLinks(c) {
    const keys = ['website', 'patreon', 'twitter', 'instagram', 'facebook', 'merch', 'share_url']

    let links_map = {}

    return keys.forEach((k) => {
        if (c[k]) links_map[k] = c[k]
    })
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
        const json = callUrl(url)

        const results = json.results.map((c) => contentToPlatformVideo(c))

        context.next = json.next

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
        let url = context.type === "video_channel"
            ? `https://content.api.nebula.app/video_channels/${context.id}/video_episodes/?ordering=-published_at`
            : `https://content.api.nebula.app/podcast_channels/${context.id}/podcast_episodes/?ordering=-published_at`

        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").ChannelContentResponse} */
        const j = context.type === "video_channel"
            ? callUrl(url)
            : JSON.parse(http.GET(
                url,
                {
                    Authorization: `Bearer ${token}`,
                    "User-Agent": USER_AGENT,
                    Host: "content.api.nebula.app"
                },
                false
            ).body)

        const results = j.results.map((v) => contentToPlatformVideo(v))

        context.next = j.next

        super(results, j.next !== null, context)
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
        /** @type {import("./types.d.ts").SearchResponse}*/
        const j = callUrl(`https://content.api.nebula.app/video_episodes/search/?include=&page=${context.page}&q=${context.q}`)

        const results = j.results.map((c) => contentToPlatformVideo(c))

        super(results, j.next !== null, context)
    }
    nextPage() {
        this.context.page++
        return new SearchPager(this.context)
    }
}
class SearchPagerChannels extends ChannelPager {
    /**
     * Search channels
     * @param {import("./types.d.ts").SearchChannelContext} context the context
     */
    constructor(context) {
        const results = []

        if (context.next !== null) {
            /** @type {import("./types.d.ts").SearchChannelResponse} */
            const j = callUrl(context.next)

            results.push(...j.results.map((v) => searchChannelToPlatformChannel(v)))

            context.next = j.next
        }

        if (context.podcastNext !== null) {
            const j = callUrl(context.podcastNext)

            context.podcastNext = j.next

            results.push(...j.results.map((v) => searchChannelToPlatformChannel(v)))
        }

        super(results, context.podcastNext !== null || context.next !== null, context)
    }
    nextPage() {
        return new SearchPagerChannels(this.context)
    }
}
class ClassSearchPager extends PlaylistPager {
    constructor(query) {
        const response = callUrl(`https://content.api.nebula.app/classes/search/?q=${query}`)
        const results = response.results.map(classToPlaylist)
        super(results, response.next !== null)
        this.next = response.next
    }
    nextPage() {
        const response = callUrl(this.next)
        this.next = response.next
        this.results = response.results.map(classToPlaylist)
        this.hasMore = response.next !== null
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
        const response = callUrl(this.next)
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
        const json = JSON.parse(http.GET(
            url,
            {
                Authorization: `Bearer ${token}`,
                'User-Agent': USER_AGENT,
                Accept: 'application/json, text/plain, */*',
                'Nebula-App-Version': APP_VERSION,
                'Nebula-Platform': 'web',
                Origin: 'https://nebula.tv',
                Host: 'content.api.nebula.app'
            },
            false
        ).body)

        const results = json.results.map((c) => contentToPlatformVideo(c))

        context.next = json.next

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
function searchChannelToPlatformChannel(c) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, c.id, plugin.config.id, PLATFORM_CLAIMTYPE),
        name: c.title,
        thumbnail: c.images === undefined ? c.assets["stripped-original"] : c.images.avatar.src,
        banner: c.images?.banner.src,
        subscribers: -1,
        description: c.description,
        url: `${BASE_URL}${c.slug}`,
        links: getChannelLinks(c),
    })
}
/**
 * Convert a content object to a platform video
 * @param { import("./types.d.ts").Content } c
 * @returns { PlatformVideo }
 */
function contentToPlatformVideo(c) {
    const thumbnailUrl = c.images === undefined
        ? c.assets["stripped-original"]
        : c.images.thumbnail?.src
    const channelThumbnailUrl = c.images === undefined
        ? c.assets["stripped-original"]
        : c.images.channel_avatar?.src
    const author = c.class === undefined
        ? new PlatformAuthorLink(
            new PlatformID(PLATFORM, c.channel_id, plugin.config.id, PLATFORM_CLAIMTYPE),
            c.channel_title,
            BASE_URL + c.channel_slug,
            channelThumbnailUrl
        )
        : new PlatformAuthorLink(
            new PlatformID(PLATFORM, c.class.creator, plugin.config.id, PLATFORM_CLAIMTYPE),
            c.class.creator,
            c.class.creator
        )
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, c.id, plugin.config.id),
        name: c.title,
        thumbnails: new Thumbnails([new Thumbnail(thumbnailUrl ?? channelThumbnailUrl, HARDCODED_ZERO)]),
        author,
        uploadDate: parseInt(new Date(c.published_at === undefined ? c.class.published_at : c.published_at).getTime() / 1000),
        duration: c.duration,
        viewCount: 0,
        url: c.share_url,
        isLive: false,
    })
}
/**
 * Converts a saved video to a platform video
 * @param {import("./types.d.ts").Content} c
 * @param {string} manifest_url
 * @returns {PlatformVideoDetails}
 */
function contentToPlatformVideoDetails(c, manifest_url) {
    const pv = contentToPlatformVideo(c)
    const pvd = new PlatformVideoDetails(pv)
    pvd.description = c.description === undefined ? c.class.description : c.description
    if (c.images === undefined) {
        pvd.video = new UnMuxVideoSourceDescriptor([], [new AudioUrlSource({
            name: "English",
            bitrate: 128000,
            // container: "mp3",
            // codecs: "mp3",
            // duration: 65,
            url: c.episode_url,
            language: "en"
        })])
    } else {
        pvd.video = new VideoSourceDescriptor([
            new HLSSource({ name: 'hls', duration: c.duration, url: manifest_url })
        ])
        pvd.subtitles = [{
            name: "English",
            format: "text/vtt",
            getSubtitles() {
                const manifestResponse = http.GET(manifest_url, {}, false)
                const url = manifestResponse.url

                const prefix = url.match(/^(https:\/\/starlight\.nebula\.tv\/.*\/).*\.m3u8$/)[1]

                const matchResult = manifestResponse.body.match(/(subtitles\/en.*\/)media\.[a-z0-9]{12}\.m3u8/)
                const nextUrl = prefix + matchResult[0]
                const intermediateResponse = callUrl(
                    nextUrl,
                    false,
                    false
                ).match(/main\.[a-z0-9]{12}\.vtt/)[0]
                const nextNextUrl = prefix + matchResult[1] + intermediateResponse

                return callUrl(nextNextUrl, false, false)
            }
        }]
    }
    return pvd
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
        datetime: parseInt(new Date(nebulaClass.published_at).getTime() / 1000),
        url: `${nebulaClass.share_url}1?tab=lessons`,
        videoCount: nebulaClass.lesson_count,
        thumbnail: nebulaClass.images.featured.src
    })
}
//#endregion
