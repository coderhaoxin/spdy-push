
var Readable = require('stream').Readable
var assert = require('assert')
var https = require('https')
var spdy = require('spdy')
var keys = require('spdy-keys')
var join = require('path').join
var zlib = require('mz/zlib')
var get = require('raw-body')
var koa = require('koa')
var fs = require('fs')
var co = require('co')

var push = require('..')

var port
var server
var agent

afterEach(function (done) {
  agent.close()
  server.close(done)
})

describe('Streams', function () {
  describe('when empty', function () {
    it('should still send', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204
        var stream = new Readable
        stream.push(null)

        push()(this, {
          path: '/',
          body: stream,
        })
      }))

      var res = yield pull
      res.resume()

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('when text', function () {
    it('should gzip', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204
        var stream = new Readable
        stream.push('klajsdlkfjalksdjflaksjdflaksjdfkjasldkfjaklsjdf')
        stream.push(null)

        push()(this, {
          path: '/',
          headers: {
            'content-type': 'text/plain'
          },
          body: stream,
        })
      }))

      var res = yield pull
      res.resume()
      res.should.have.header('Content-Encoding', 'gzip')
      res.should.have.header('Content-Type', 'text/plain')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('when image', function () {
    it('should not gzip', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204
        var stream = new Readable
        stream.push(null)

        push()(this, {
          path: '/',
          headers: {
            'content-type': 'image/png'
          },
          body: stream,
        })
      }))

      var res = yield pull
      res.resume()
      res.should.not.have.header('Content-Encoding')
      res.should.have.header('Content-Type', 'image/png')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('.svg', function () {
    it('should push', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push()(this, {
          path: '/fontawesome-webfont.svg',
          filename: join(__dirname, 'fontawesome-webfont.svg')
        })
      }))

      var res = yield pull
      res.resume()
      res.should.have.header('Content-Encoding', 'gzip')
      res.should.have.header('Content-Type', 'image/svg+xml')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('when content-encoding is already set', function () {
    it('should not re-encode', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push()(this, {
          path: '/something.txt',
          body: 'text',
          headers: {
            'content-encoding': 'identity'
          }
        })
      }))

      var res = yield pull
      res.resume()
      res.should.have.header('Content-Encoding', 'identity')
      res.should.have.header('Content-Type', 'text/plain; charset=utf-8')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('when compressing', function () {
    it('should remove the content-length', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push()(this, {
          path: '/something.txt',
          body: new Buffer(2048),
          headers: {
            'content-length': '2048'
          }
        })
      }))

      var res = yield pull
      res.resume()
      res.should.have.header('Content-Encoding', 'gzip')
      res.should.have.header('Content-Type', 'text/plain; charset=utf-8')
      res.should.not.have.header('Content-Length')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })
})

describe('Files with Content-Length', function () {
  describe('when below threshold', function () {
    it('should not compress', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push({
          threshold: '100kb'
        })(this, {
          path: '/',
          headers: {
            'content-length': '1099',
            'content-type': 'text/plain'
          },
          filename: join(__dirname, '..', 'LICENSE'),
        })
      }))

      var res = yield pull
      res.resume()
      res.should.not.have.header('Content-Encoding')
      res.should.have.header('Content-Type', 'text/plain')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })

  describe('when above threshold', function () {
    it('should compress', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push({
          threshold: 1
        })(this, {
          path: '/',
          headers: {
            'content-length': '1099',
            'content-type': 'text/plain'
          },
          filename: join(__dirname, '..', 'LICENSE'),
        })
      }))

      var res = yield pull
      res.resume()
      res.should.have.header('Content-Encoding', 'gzip')
      res.should.have.header('Content-Type', 'text/plain')

      yield function (done) {
        res.on('end', done)
        res.on('error', done)
      }
    }))
  })
})

describe('RST_STREAM', function () {
  it('should not leak file descriptors', co(function* () {
    var called = false
    var stream = new Readable
    stream.destroy = function () {
      called = true
    }

    yield listen(koa().use(function* () {
      this.status = 204

      push({
        threshold: 1
      })(this, {
        path: '/',
        headers: {
          'content-type': 'text/plain'
        },
        body: stream,
      })
    }))

    var res = yield pull
    res.destroy()
    res.should.have.header('Content-Encoding', 'gzip')
    res.should.have.header('Content-Type', 'text/plain')

    assert(called)
  }))
})

describe('Strings', function () {
  describe('when no content-type is set', function () {
    it('should set the content-type if possible', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push()(this, {
          path: '/some.txt',
          body: 'lol'
        })
      }))

      var res = yield pull
      res.should.have.header('Content-Type', 'text/plain; charset=utf-8')

      var buffer = yield get(res, true)
      buffer.should.equal('lol')
    }))
  })
})

describe('Buffers', function () {
  describe('when already compress', function () {
    it('should not compress', co(function* () {
      yield listen(koa().use(function* () {
        this.status = 204

        push({
          threshold: 1
        })(this, {
          path: '/',
          headers: {
            'content-encoding': 'gzip',
            'content-type': 'text/plain'
          },
          body: yield zlib.gzip('lol')
        })
      }))

      var res = yield pull
      res.should.have.header('Content-Encoding', 'gzip')
      res.should.have.header('Content-Type', 'text/plain')

      var buffer = yield get(res)
      buffer.toString('utf8').should.equal('lol')
    }))
  })
})

describe('yield push', function () {
  it('should wait until the stream is finished writing', co(function* () {
    yield listen(koa().use(function* () {
      this.status = 204

      var stream = yield push({
        threshold: 1
      })(this, {
        path: '/',
        headers: {
          'content-encoding': 'gzip',
          'content-type': 'text/plain'
        },
        body: yield zlib.gzip('lol')
      })

      stream.writable.should.be.false
    }))

    var res = yield pull
    res.should.have.header('Content-Encoding', 'gzip')
    res.should.have.header('Content-Type', 'text/plain')

    var buffer = yield get(res)
    buffer.toString('utf8').should.equal('lol')
  }))
})

function listen(app) {
  // app.on('error', function (err) {
  //   console.error(err.stack)
  // })
  server = spdy.createServer(keys, app.callback())

  return function (done) {
    server.listen(port, function (err) {
      if (err) return done(err)

      port = this.address().port
      done()
    })
  }
}

function pull(done) {
  agent = spdy.createAgent({
    port: port,
    rejectUnauthorized: false,
  })

  agent.once('error', done)
  agent.once('push', function (stream) {
    done(null, stream)
  })

  https.request({
    agent: agent,
    path: '/',
  })
  .once('error', done)
  .once('response', function (res) {
    if (res.statusCode !== 204) done(new Error('got status code: ' + res.statusCode))
    res.resume()
  })
  .end()
}
