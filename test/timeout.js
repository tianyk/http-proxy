const http = require('http');
const url = require('url');

const server = http.createServer();

server.on('request', (req, res) => {
    const { query } = url.parse(req.url, true);

    setTimeout((timeout) => {
        res.end(timeout || 'ok');
    }, query.timeout || 1000, query.timeout);
});

server.listen(8899);