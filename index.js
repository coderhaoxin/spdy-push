
var debug = require('debug')('koa-spdy-push')
var compressible = require('compressible')
var basename = require('path').basename
var inspect = require('util').inspect
var Promise = require('bluebird')
var mime = require('mime-types')
var dethroy = require('destroy')
var bytes = require('bytes')
var zlib = require('zlib')
var fs = require('fs')

module.exports = function (compressOptions) {
  compressOptions = compressOptions || {}

  var filter = compressOptions.filter || compressible
  var threshold = compressOptions.threshold || 1024
  if (typeof threshold === 'string') threshold = bytes(threshold)

  return function push(context, options) {
    // koa properties
    var res = context.res
    var onerror = context.onerror

    // push options
    var path = options.path
    var headers = options.headers || {}
    // 7 is lowest priority, 0 is highest.
    // http://www.chromium.org/spdy/spdy-protocol/spdy-protocol-draft3#TOC-2.3.3-Stream-priority
    var priority = options.priority
    if (typeof priority !== 'number') priority = 7

    // types of bodies
    var body = options.body
    var filename = options.filename
    var length = contentLength()
    var type = headers['content-type']
    if (!type) {
      type = mime.contentType(basename(path))
      if (type) headers['content-type'] = type
    }

    // check whether to compress the stream
    var compress = (body || filename) // need some sort of body
      // must be above the threshold, but if we don't know the length,
      // i.e. a stream, just compress it
      && (typeof length !== 'number' || length > threshold)
      // can't already set a content-encoding,
      // even if it's `identity`
      && !headers['content-encoding']
      // must be a compressible content type
      && filter(type)

    if (compress) {
      headers['content-encoding'] = 'gzip'
      // delete the content length as it's going to change with
      // compression. ideally we'll update with the compressed
      // content-length but whatever
      delete headers['content-length']
    } else if (typeof length === 'number') {
      // set the content-length if we have it
      headers['content-length'] = String(length)
    }

    debug('pushing %s w/ \n%s', path, inspect(headers))

    // regular push stream handling
    var stream = res.push(path, headers, priority)
    stream.on('acknowledge', acknowledge)
    stream.on('error', cleanup)
    stream.on('close', cleanup)

    return new Promise(function (resolve, reject) {
      stream.on('finish', finish)
      stream.on('error', finish)
      stream.on('close', finish)

      function finish(err) {
        if (err = filterError(err)) reject(err)
        else resolve(stream)

        stream.removeListener('finish', finish)
        stream.removeListener('error', finish)
        stream.removeListener('close', finish)
      }
    })

    function acknowledge() {
      cleanup()

      // empty stream
      if (!body && !filename) return stream.end()

      // we can just use the utility method
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        if (!compress) return stream.end(body)
        zlib.gzip(body, function (err, body) {
          // doubt this would ever happen,
          // but be sure to destroy the stream in case of errors
          if (err) {
            onerror(err)
            stream.destroy()
            return
          }

          stream.end(body)
        })
        return
      }

      // convert a filename to stream
      if (filename) body = fs.createReadStream(filename)

      // handle the stream
      body.on('error', destroy)
      if (compress) {
        body
        .pipe(zlib.Gzip(compressOptions))
        .on('error', destroy)
        .pipe(stream)
      } else {
        body.pipe(stream)
      }

      // make sure we don't leak file descriptors when the client cancels these streams
      stream.on('error', destroy)
      stream.on('close', destroy)
      stream.on('finish', destroy)

      function destroy(err) {
        if (err) onerror(filterError(err))
        dethroy(body)

        stream.removeListener('close', destroy)
        stream.removeListener('finish', destroy)
      }
    }

    // try to get the content-length of the request
    function contentLength() {
      if (headers['content-length']) return parseInt(headers['content-length'], 10)
      // not worth `fs.stat()`ing for this
      if (filename) return false
      if (!body) return 0
      if (typeof body === 'string') return Buffer.byteLength(body)
      if (Buffer.isBuffer(body)) return body.length
    }

    function cleanup(err) {
      if (err) onerror(filterError(err))

      stream.removeListener('acknowledge', acknowledge)
      stream.removeListener('close', cleanup)
    }
  }
}

// we don't care about these errors
// and we don't want to clog up `this.onerror`
function filterError(err) {
  if (err == null) return
  if (!(err instanceof Error)) return
  if (err.code === 'RST_STREAM') {
    debug('got RST_STREAM %s', err.status)
    return
  }
  // WHY AM I GETTING THESE ERRORS?
  if (err.message === 'Write after end!') return
  return err
}
