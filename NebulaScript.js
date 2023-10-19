//* Constants
const APP_VERSION = '23.7.0'
const BASE_URL = 'https://nebula.tv/'
const LANG = 'en'
const PLATFORM = 'nebula'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
const PLATFORM_CLAIMTYPE = 19;

var config = {}

let token = ''

//* Source
source.enable = function (conf) {
    token = getToken()
}
source.getHome = function () {
    return new HomePager({ next: null })
}
source.searchSuggestions = function (query) {
    // not in nebula
    return []
}
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
source.getSearchChannelContentsCapabilities = function () {
    return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }
}
source.searchChannels = function (query) {
    return new SearchPagerChannels({ q: query, next: null })
}
source.isChannelUrl = function (url) {
    return /nebula\.tv\/[a-zA-Z0-9-_]+\/?/.test(url)
}
source.getChannel = function (url) {
    const login = url
        .split('/')
        .filter((v) => v !== '')
        .pop()

    /** @type {import("./types.d.ts").Channel} */
    const j = callUrl(`https://content.api.nebula.app/content/${login}`)

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, j.id, config.id, PLATFORM_CLAIMTYPE),
        name: j.title,
        thumbnail: j.images.avatar.src,
        banner: j.images.banner.src,
        subscribers: -1,
        description: j.description,
        url: url,
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

    return new ChannelVideoPager({ next: null, id: j.id })
}


source.getChannelTemplateByClaimMap = () => {
    return {
        //Nebula
        19: {
            0: URL_BASE + "{{CLAIMVALUE}}"
        }
    };
};


source.isContentDetailsUrl = function (url) {
    return /nebula\.tv\/videos\/[a-zA-Z0-9-_]+\/?/.test(url)
}
source.getContentDetails = function (url) {
    const id = url.split('/').pop()

    if(!bridge.isLoggedIn())
        throw new UnavailableException('Nebula videos are only available after login');
    /** @type {import("./types.d.ts".ContentDetail)} */
    const j = callUrl(`https://content.api.nebula.app/content/videos/${id}`, true)

    // const token = getToken()

    const manifest_url = `https://content.api.nebula.app/video_episodes/${j.id}/manifest.m3u8?token=${token}&app_version=${APP_VERSION}&platform=web`

    // log(manifest_url)

    // callUrl(manifest_url, false, false) // this request verifies that the user has access to watch the video. If the user does not have access, the error checking in the callUrl method will throw an exception

    return contentToPlatformVideoDetails(j, manifest_url)
}
// source.getUserSubscriptions = function () {
//     /** @type {import("./types.d.ts").SubscriptionResponse} */
//     const j = callUrl('https://content.api.nebula.app/video_channels/?following=true&ordering=-follow', true)

//     return j.results.map((c) => c.share_url)
// }
source.getComments = function (url) {
    return new CommentPager([], false, {}) //Not implemented
}
source.getSubComments = function (comment) {
    return new CommentPager([], false, {}) //Not implemented
}
//* Internals
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
            Host: url.split('/')[2],
        },
        use_authenticated
    )

    if (!resp.isOk) {
        // log(resp)
        if (resp.code === 401) {
            throw new UnavailableException('Video is only available to Nebula Subscribers')
        } else {
            throw new ScriptException(resp.statusMessage)
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
//* Pagers
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
        let url = `https://content.api.nebula.app/video_channels/${context.id}/video_episodes/?ordering=-published_at`

        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").ChannelContentResponse} */
        const j = callUrl(url)

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
        let url = `https://content.api.nebula.app/video_channels/search/?include=&q=${context.q}`

        if (context.next !== null) url = context.next

        /** @type {import("./types.d.ts").SearchChannelResponse} */
        const j = callUrl(url)

        const results = j.results.map((v) => searchChannelToPlatformChannel(v))

        context.next = j.next

        super(results, j.next !== null, context)
    }

    nextPage() {
        return new SearchPagerChannels(this.context)
    }
}
//* Converters
/**
 * Convert a search channel to a platform channel
 * @param {import("./types.d.ts").Channel} c
 * @returns { PlatformChannel }
 */
function searchChannelToPlatformChannel(c) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, c.id, config.id, PLATFORM_CLAIMTYPE),
        name: c.title,
        thumbnail: c.images.avatar.src,
        banner: c.images.banner.src,
        subscribers: -1,
        description: c.description,
        url: BASE_URL + c.slug,
        links: getChannelLinks(c),
    })
}
/**
 * Convert a content object to a platform video
 * @param { import("./types.d.ts").Content } c
 * @returns { PlatformVideo }
 */
function contentToPlatformVideo(c) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, c.id, config.id),
        name: c.title,
        thumbnails: new Thumbnails([new Thumbnail(c.images.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, c.channel_id, config.id, PLATFORM_CLAIMTYPE),
            c.channel_title,
            BASE_URL + c.channel_slug,
            c.images.channel_avatar.src
        ),
        uploadDate: parseInt(new Date(c.published_at).getTime() / 1000),
        duration: c.duration,
        viewCount: 0,
        url: BASE_URL + 'videos/' + c.slug,
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
    pvd.description = c.description
    pvd.video = new VideoSourceDescriptor([new HLSSource({ name: 'hls', duration: c.duration, url: manifest_url })])
    return pvd
}

console.log('LOADED')
