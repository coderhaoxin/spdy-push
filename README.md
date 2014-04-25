# Koa SPDY Push

SPDY Push helper for Koa.
Automatically handles `close` events and errors to avoid leaks.

## API

### push(this, options)

```js
var push = require('koa-spdy-push')({
  threshold: 1kb
})

app.use(function* () {
  is (!this.res.isSpdy) return

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
