//Reference Scriptfile
//Intended exclusively for auto-complete in your IDE, not for execution
var IS_TESTING = false

let Type = {
    Source: {
        Dash: 'DASH',
        HLS: 'HLS',
        STATIC: 'Static',
    },
    Feed: {
        Videos: 'VIDEOS',
        Streams: 'STREAMS',
        Mixed: 'MIXED',
        Live: 'LIVE',
    },
    Order: {
        Chronological: 'CHRONOLOGICAL',
    },
    Date: {
        LastHour: 'LAST_HOUR',
        Today: 'TODAY',
        LastWeek: 'LAST_WEEK',
        LastMonth: 'LAST_MONTH',
        LastYear: 'LAST_YEAR',
    },
    Duration: {
        Short: 'SHORT',
        Medium: 'MEDIUM',
        Long: 'LONG',
    },
}

let Language = {
    UNKNOWN: 'Unknown',
    ARABIC: 'Arabic',
    SPANISH: 'Spanish',
    FRENCH: 'French',
    HINDI: 'Hindi',
    INDONESIAN: 'Indonesian',
    KOREAN: 'Korean',
    PORTBRAZIL: 'Portuguese Brazilian',
    RUSSIAN: 'Russian',
    THAI: 'Thai',
    TURKISH: 'Turkish',
    VIETNAMESE: 'Vietnamese',
    ENGLISH: 'English',
}

class ScriptException extends Error {
    constructor(type, msg) {
        if (arguments.length == 1) {
            super(arguments[0])
            this.plugin_type = 'ScriptException'
            this.message = arguments[0]
        } else {
            super(msg)
            this.plugin_type = type ?? '' //string
            this.msg = msg ?? '' //string
        }
    }
}
class UnavailableException extends ScriptException {
    constructor(msg) {
        super('UnavailableException', msg)
    }
}
class AgeException extends ScriptException {
    constructor(msg) {
        super('AgeException', msg)
    }
}
class TimeoutException extends ScriptException {
    constructor(msg) {
        super(msg)
        this.plugin_type = 'ScriptTimeoutException'
    }
}

class Thumbnails {
    constructor(thumbnails) {
        this.sources = thumbnails ?? [] // Thumbnail[]
    }
}
class Thumbnail {
    constructor(url, quality) {
        this.url = url ?? '' //string
        this.quality = quality ?? 0 //integer
    }
}

class PlatformID {
    constructor(platform, id, pluginId) {
        this.platform = platform ?? '' //string
        this.pluginId = pluginId //string
        this.value = id //string
    }
}

class ResultCapabilities {
    constructor(types, sorts, filters) {
        this.types = types ?? []
        this.sorts = sorts ?? []
        this.filters = filters ?? []
    }
}
class FilterGroup {
    constructor(name, filters, isMultiSelect, id) {
        if (!name) throw new ScriptException('No name for filter group')
        if (!filters) throw new ScriptException('No filter provided')

        this.name = name
        this.filters = filters
        this.isMultiSelect = isMultiSelect
        this.id = id
    }
}
class FilterCapability {
    constructor(name, value, id) {
        if (!name) throw new ScriptException('No name for filter')
        if (!value) throw new ScriptException('No filter value')

        this.name = name
        this.value = value
        this.id = id
    }
}

class PlatformAuthorLink {
    constructor(id, name, url, thumbnail, subscribers) {
        this.id = id ?? PlatformID() //PlatformID
        this.name = name ?? '' //string
        this.url = url ?? '' //string
        this.thumbnail = thumbnail //string
        if (subscribers) this.subscribers = subscribers
    }
}
class Content {
    constructor(type) {
        this.contentType = type
    }
}
class ContentDetails {
    constructor(type) {
        this.contentType = type
    }
}
class PlatformVideo extends Content {
    constructor(obj) {
        super(1)
        obj = obj ?? {}
        this.plugin_type = 'PlatformVideo'
        this.id = obj.id ?? PlatformID() //PlatformID
        this.name = obj.name ?? '' //string
        this.thumbnails = obj.thumbnails //Thumbnail[]
        this.author = obj.author //PlatformAuthorLink
        this.datetime = obj.datetime ?? obj.uploadDate ?? 0 //OffsetDateTime (Long)
        this.url = obj.url ?? '' //String

        this.duration = obj.duration ?? -1 //Long
        this.viewCount = obj.viewCount ?? -1 //Long

        this.isLive = obj.isLive ?? false //Boolean
    }
}
class PlatformVideoDetails extends PlatformVideo {
    constructor(obj) {
        super(obj)
        obj = obj ?? {}
        this.plugin_type = 'PlatformVideoDetails'

        this.description = obj.description ?? '' //String
        this.video = obj.video ?? {} //VideoSourceDescriptor
        this.dash = obj.dash ?? null //DashSource
        this.hls = obj.hls ?? null //HLSSource
        this.live = obj.live ?? null //VideoSource

        this.rating = obj.rating ?? null //IRating
        this.subtitles = obj.subtitles ?? []
    }
}

//Sources
class VideoSourceDescriptor {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'MuxVideoSourceDescriptor'
        this.isUnMuxed = false

        if (obj.constructor === Array) this.videoSources = obj
        else this.videoSources = obj.videoSources ?? []
    }
}
class UnMuxVideoSourceDescriptor {
    constructor(videoSourcesOrObj, audioSources) {
        videoSourcesOrObj = videoSourcesOrObj ?? {}
        this.plugin_type = 'UnMuxVideoSourceDescriptor'
        this.isUnMuxed = true

        if (videoSourcesOrObj.constructor === Array) {
            this.videoSources = videoSourcesOrObj
            this.audioSources = audioSources
        } else {
            this.videoSources = videoSourcesOrObj.videoSources ?? []
            this.audioSources = videoSourcesOrObj.audioSources ?? []
        }
    }
}

class VideoUrlSource {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'VideoUrlSource'
        this.width = obj.width ?? 0
        this.height = obj.height ?? 0
        this.container = obj.container ?? ''
        this.codec = obj.codec ?? ''
        this.name = obj.name ?? ''
        this.bitrate = obj.bitrate ?? 0
        this.duration = obj.duration ?? 0
        this.url = obj.url
    }
}
class YTVideoSource extends VideoUrlSource {
    constructor(obj) {
        super(obj)
        this.plugin_type = 'VideoYTSource'

        this.itagId = obj.itagId ?? null
        this.initStart = obj.initStart ?? null
        this.initEnd = obj.initEnd ?? null
        this.indexStart = obj.indexStart ?? null
        this.indexEnd = obj.indexEnd ?? null
    }
}
class AudioUrlSource {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'AudioUrlSource'
        this.name = obj.name ?? ''
        this.bitrate = obj.bitrate ?? 0
        this.container = obj.container ?? ''
        this.codec = obj.codec ?? ''
        this.duration = obj.duration ?? 0
        this.url = obj.url
        this.language = obj.language ?? Language.UNKNOWN
    }
}
class YTAudioSource extends AudioUrlSource {
    constructor(obj) {
        super(obj)
        this.plugin_type = 'AudioYTSource'

        this.itagId = obj.itagId ?? null
        this.initStart = obj.initStart ?? null
        this.initEnd = obj.initEnd ?? null
        this.indexStart = obj.indexStart ?? null
        this.indexEnd = obj.indexEnd ?? null
        this.audioChannels = obj.audioChannels ?? 2
    }
}
class HLSSource {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'HLSSource'
        this.name = obj.name ?? 'HLS'
        this.duration = obj.duration ?? 0
        this.url = obj.url
    }
}
class DashSource {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'DashSource'
        this.name = obj.name ?? 'Dash'
        this.duration = obj.duration ?? 0
        this.url = obj.url
    }
}

//Channel
class PlatformChannel {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'PlatformChannel'
        this.id = obj.id ?? '' //string
        this.name = obj.name ?? '' //string
        this.thumbnail = obj.thumbnail //string
        this.banner = obj.banner //string
        this.subscribers = obj.subscribers ?? 0 //integer
        this.description = obj.description //string
        this.url = obj.url ?? '' //string
        this.links = obj.links ?? {} //Map<string,string>
    }
}

//Playlist
class PlatformPlaylist {
    constructor(obj) {
        obj = obj ?? {}
        this.plugin_type = 'PlatformPlaylist'
        this.id = obj.id ?? null
        this.url = obj.url
        this.name = obj.name ?? ''
        this.videoCount = obj.videoCount ?? 0
        this.thumbnail = obj.thumbnail
    }
}
class PlatformPlaylistDetails extends PlatformPlaylist {
    constructor(obj) {
        super(obj)
        this.plugin_type = 'PlatformPlaylistDetails'
        this.contents = obj.contents
    }
}

//Ratings
class RatingLikes {
    constructor(likes) {
        this.type = 1
        this.likes = likes
    }
}
class RatingLikesDislikes {
    constructor(likes, dislikes) {
        this.type = 2
        this.likes = likes
        this.dislikes = dislikes
    }
}
class RatingScaler {
    constructor(value) {
        this.type = 3
        this.value = value
    }
}

class Comment {
    constructor(obj) {
        this.plugin_type = 'Comment'
        this.contextUrl = obj.contextUrl ?? ''
        this.author = obj.author ?? new PlatformAuthorLink(null, '', '', null)
        this.message = obj.message ?? ''
        this.rating = obj.rating ?? new RatingLikes(0)
        this.date = obj.date ?? 0
        this.replyCount = obj.replyCount ?? 0
        this.context = obj.context ?? {}
    }
}

class LiveEventPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'LiveEventPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
        this.nextRequest = 4000
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new Pager([], false, this.context)
    }
}

class LiveEvent {
    constructor(type) {
        this.type = type
    }
}
class LiveEventComment extends LiveEvent {
    constructor(name, message, thumbnail) {
        super(1)
        this.name = name
        this.message = message
        this.thumbnail = thumbnail
    }
}
class LiveEventEmojis extends LiveEvent {
    constructor(emojis) {
        super(4)
        this.emojis = emojis
    }
}
class LiveEventDonation extends LiveEvent {
    constructor(amount, name, message, thumbnail) {
        super(5)
        this.amount = amount
        this.name = name
        this.message = message ?? ''
        this.thumbnail = thumbnail
    }
}
class LiveEventViewCount extends LiveEvent {
    constructor(viewCount) {
        super(10)
        this.viewCount = viewCount
    }
}
class LiveEventRaid extends LiveEvent {
    constructor(targetUrl, targetName, targetThumbnail) {
        super(100)
        this.targetUrl = targetUrl
        this.targetName = targetName
        this.targetThumbnail = targetThumbnail
    }
}

//Pagers
class ContentPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'ContentPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new ContentPager([], false, this.context)
    }
}
class VideoPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'VideoPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new VideoPager([], false, this.context)
    }
}
class ChannelPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'ChannelPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new Pager([], false, this.context)
    }
}
class PlaylistPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'PlaylistPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new Pager([], false, this.context)
    }
}
class CommentPager {
    constructor(results, hasMore, context) {
        this.plugin_type = 'CommentPager'
        this.results = results ?? []
        this.hasMore = hasMore ?? false
        this.context = context ?? {}
    }

    hasMorePagers() {
        return this.hasMore
    }
    nextPage() {
        return new Pager([], false, this.context)
    }
}

function throwException(type, message) {
    throw new Error('V8EXCEPTION:' + type + '-' + message)
}

//To override by plugin
const source = {
    getHome() {
        return new ContentPager([], false, {})
    },

    enable(config) {},
    disable() {},

    searchSuggestions(query) {
        return []
    },
    getSearchCapabilities() {
        return { types: [], sorts: [] }
    },
    search(query, type, order, filters) {
        return new ContentPager([], false, {})
    }, //TODO
    //OPTIONAL getSearchChannelContentsCapabilities(){ return { types: [], sorts: [] }; },
    //OPTIONAL searchChannelContents(channelUrl, query, type, order, filters){ return new Pager([], false, {}); }, //TODO

    isChannelUrl(url) {
        return false
    },
    getChannel(url) {
        return null
    },
    getChannelCapabilities() {
        return { types: [], sorts: [] }
    },
    getChannelContents(url, type, order, filters) {
        return new ContentPager([], false, {})
    },

    isContentDetailsUrl(url) {
        return false
    },
    getContentDetails(url) {}, //TODO

    //OPTIONAL getComments(url){ return new Pager([], false, {}); }, //TODO
    //OPTIONAL getSubComments(comment){ return new Pager([], false, {}); }, //TODO

    //OPTIONAL getSubscriptionsUser(){ return []; },
    //OPTIONAL getPlaylistsUser(){ return []; }
}

function parseSettings(settings) {
    if (!settings) return {}
    let newSettings = {}
    for (let key in settings) {
        if (typeof settings[key] == 'string') newSettings[key] = JSON.parse(settings[key])
        else newSettings[key] = settings[key]
    }
    return newSettings
}

function log(str) {
    if (str) {
        if (typeof str == 'string') bridge.log(str)
        else bridge.log(JSON.stringify(str, null, 4))
    }
}

//Package Bridge (variable: bridge)
let bridge = {
    /**
     * @return {Boolean}
     **/
    isLoggedIn: function () {},

    /**
     * @param {String} str
     * @return {Unit}
     **/
    log: function (str) {},

    /**
     * @param {String} str
     * @return {Unit}
     **/
    throwTest: function (str) {},

    /**
     * @param {String} str
     * @return {Unit}
     **/
    toast: function (str) {},
}

//Package Http (variable: http)
let http = {
    /**
     * @param {String} url
     * @param {Map} headers
     * @param {Boolean} useAuth
     * @return {BridgeHttpResponse}
     **/
    GET: function (url, headers, useAuth) {},

    /**
     * @param {String} url
     * @param {String} body
     * @param {Map} headers
     * @param {Boolean} useAuth
     * @return {BridgeHttpResponse}
     **/
    POST: function (url, body, headers, useAuth) {},

    /**
     * @return {BatchBuilder}
     **/
    batch: function () {},

    /**
     * @param {String} method
     * @param {String} url
     * @param {Map} headers
     * @param {Boolean} useAuth
     * @return {BridgeHttpResponse}
     **/
    request: function (method, url, headers, useAuth) {},

    /**
     * @param {String} method
     * @param {String} url
     * @param {String} body
     * @param {Map} headers
     * @param {Boolean} useAuth
     * @return {BridgeHttpResponse}
     **/
    requestWithBody: function (method, url, body, headers, useAuth) {},

    /**
     * @param {V8ValueObject} socketObj
     * @param {Boolean} useAuth
     * @return {SocketResponse}
     **/
    socket: function (socketObj, useAuth) {},
}
