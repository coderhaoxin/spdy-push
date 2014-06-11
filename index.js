
var debug = require('debug')('koa-spdy-push')
var compressible = require('compressible')
var inspect = require('util').inspect
var dethroy = require('dethroy')
var bytes = require('bytes')
var zlib = require('zlib')
var fs = require('fs')

module.exports = function (compressOptions) {
  compressOptions = compressOptions || {}

  var filter = compressOptions.filter || compressible
  var threshold = compressOptions.threshold || 1024
  if (typeof threshold === 'string') threshold = bytes(threshold)

  return function push(context, options, done) {
    done = done || noop

    // koa properties
    var res = context.res
    var socket = context.socket
    var onerror = context.onerror

    // push options
    var path = options.path
    var headers = options.headers
    // 7 is lowest priority, 0 is highest.
    // http://www.chromium.org/spdy/spdy-protocol/spdy-protocol-draft3#TOC-2.3.3-Stream-priority
    var priority = options.priority
    if (typeof priority !== 'number') priority = 7

    // types of bodies
    var body = options.body
    var filename = options.filename
    // check whether to compress the stream
    var length = contentLength()
    var compress = (body || filename)
      && (typeof length !== 'number' || length > threshold)
      && !headers['content-encoding']
      && filter(headers['content-type'])
    if (compress) {
      headers['content-encoding'] = 'gzip'
      delete headers['content-length']
    } else if (typeof length === 'number') {
      headers['content-length'] = String(length)
    }

    debug('pushing %s w/ \n%s', path, inspect(headers))

    // regular push stream handling
    var stream = res.push(path, headers, priority)
    stream.on('acknowledge', acknowledge)
    stream.on('error', cleanup)
    stream.on('close', cleanup)
    socket.on('close', cleanup)

    // handle the deferred thunk
    stream.on('finish', finish)
    stream.on('error', finish)
    stream.on('close', finish)
    socket.on('close', finish)

    return function (fn) {
      done = fn
    }

    function acknowledge() {
      cleanup()

      if (!body && !filename) return stream.end()

      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        if (!compress) return stream.end(body)
        zlib.gzip(body, function (err, body) {
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
      socket.on('close', destroy)

      function destroy(err) {
        if (err) onerror(filterError(err))
        dethroy(body)

        stream.removeListener('close', destroy)
        stream.removeListener('finish', destroy)
        socket.removeListener('close', destroy)
      }
    }

    function contentLength() {
      if (filename) {
        // already set
        if (!headers['content-length']) return false
        return parseInt(headers['content-length'], 10)
      }

      if (!body) return 0
      if (typeof body === 'string') return Buffer.byteLength(body)
      if (Buffer.isBuffer(body)) return body.length
    }

    function cleanup(err) {
      if (err) onerror(filterError(err))

      stream.removeListener('acknowledge', acknowledge)
      stream.removeListener('close', cleanup)
      socket.removeListener('close', cleanup)
    }

    function finish(err) {
      done(filterError(err), stream)

      stream.removeListener('finish', finish)
      stream.removeListener('error', finish)
      stream.removeListener('close', finish)
      socket.removeListener('close', finish)
    }
  }
}

function filterError(err) {
  if (err == null) return
  if (!(err instanceof Error)) return
  if (err.code === 'RST_STREAM') {
    debug('got RST_STREAM %s', err.status)
    return
  }
  if (err.message === 'Write after end!') return
  return err
}

function noop() {}
