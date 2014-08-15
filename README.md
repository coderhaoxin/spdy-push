# Koa SPDY Push

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]
[![Gittip][gittip-image]][gittip-url]

SPDY Push helper for Koa.
Automatically handles `close` events and errors to avoid leaks.

## API

### push(this, options)

```js
var push = require('koa-spdy-push')({
  threshold: 1kb
})

app.use(function* () {
  if (!this.res.isSpdy) return

  push(this, {
    path: '/image.png',
    filename: 'image.png',
    headers: {
      'content-type': 'image/png'
    }
  })
})
```

Pushes a file in a separate coroutine.
Options:

- `path` <required> - The url of the stream
- `headers` <required> - Headers of the stream
- `priority: 7`  - SPDY Push stream priority, defaults to lowest
- `body` - a body of the stream, either a `String`, `Buffer`, or `Stream.Readable`
- `filename` - a filename of a body. Use this to push bodies without creating a stream first (otherwise you'll create file descriptor leaks)

Either `body` or `filename` is required.

Don't set the following headers.
These headers will be automatically set:

- `content-encoding`
- `content-length`

[npm-image]: https://img.shields.io/npm/v/koa-spdy-push.svg?style=flat-square
[npm-url]: https://npmjs.org/package/koa-spdy-push
[github-tag]: http://img.shields.io/github/tag/koajs/spdy-push.svg?style=flat-square
[github-url]: https://github.com/koajs/spdy-push/tags
[travis-image]: https://img.shields.io/travis/koajs/spdy-push.svg?style=flat-square
[travis-url]: https://travis-ci.org/koajs/spdy-push
[coveralls-image]: https://img.shields.io/coveralls/koajs/spdy-push.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/koajs/spdy-push?branch=master
[david-image]: http://img.shields.io/david/koajs/spdy-push.svg?style=flat-square
[david-url]: https://david-dm.org/koajs/spdy-push
[license-image]: http://img.shields.io/npm/l/koa-spdy-push.svg?style=flat-square
[license-url]: LICENSE.md
[downloads-image]: http://img.shields.io/npm/dm/koa-spdy-push.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/koa-spdy-push
[gittip-image]: https://img.shields.io/gittip/jonathanong.svg?style=flat-square
[gittip-url]: https://www.gittip.com/jonathanong/
