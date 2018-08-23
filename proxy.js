const http = require('http');
const net = require('net');
const url = require('url');

const PORT = process.env.PORT || 1337;
const HOST = process.env.HOST || '127.0.0.1';

const MY_IP = '0.0.0.0';

// async function findMyIP() {
//     return new Promise((resolve, reject) => {
//         const req = http.get('http://myip.ipip.net');
//         req.on('response', (res) => {
//             const { statusCode } = res;

//             let rawData = '';
//             if (statusCode === 200) {
//                 res.setEncoding('utf8');
//                 res.on('data', (chunk) => { rawData += chunk; });

//                 res.on('end', () => {
//                     const match = rawData.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
//                     if (match) {
//                         resolve(match[1]);
//                     } else {
//                         reject(new Error(`无法解析IP。${rawData}`));
//                     }
//                 })
//             } else {
//                 res.resume();
//                 reject(new Error(`请求失败。状态码: ${statusCode}`));
//             }
//         });

//         req.on('error', reject);
//     });
// }
// findMyIP().then(console.log).catch(console.error);

// 创建一个 HTTP 代理服务器
const proxy = http.createServer();

proxy.on('request', (cReq, cRes) => {
    console.log(cReq.url);

    const { method, headers } = cReq;
    const { hostname, port = 80, path } = url.parse(cReq.url);

    let via = headers['via'];
    if (via) {
        via = via += ', 1.1 proxy.kekek.cc';
    } else {
        via = '1.1 proxy.kekek.cc (Node.js-Proxy)';
    }
    headers['via'] = via;

    let ips = headers['x-forward-for'];
    if (ips) { ips += `, ${MY_IP}`; }
    else { ips = MY_IP; }
    headers['x-forward-for'] = ips;

    // Max-Forwards

    const pReq = http.request({ hostname, port, path, method, headers });

    pReq.on('response', (pRes) => {
        console.log(`[response] [proxy] ${cReq.url}`);
        cRes.writeHead(pRes.statusCode, pRes.headers);
        pRes.pipe(cRes);
    })
        .on('abort', () => {
            console.log(`[abort] [proxy] ${cReq.url}`);
        })
        .on('timeout', () => {
            cRes.end();
        })
        .on('close', () => {
            console.log(`[close] [proxy] ${cReq.url}`);
        })
        .on('error', (err) => {
            console.log(`[error] [proxy] ${cReq.url} \r\n${err.stack}`);
            cRes.end();
        });

    cReq.pipe(pReq);

    cReq.on('aborted', () => {
        console.log(`[aborted] [client] ${cReq.url}`);
        pReq.abort();
    });

    // cRes.on('close', () => {
    //     console.log(`[close] [client] ${cReq.url}`);
    // });
});


// https
proxy.on('connect', (req, cltSocket, head) => {
    console.log(req.url, head.length)
    // 连接到一个服务器
    const { port, hostname } = url.parse(`http://${req.url}`);

    const srvSocket = net.connect(port, hostname);

    srvSocket.on('connect', () => {
        cltSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Node.js-Proxy\r\n' +
            '\r\n');
        srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
    });

    srvSocket.on('end', () => {
        // 远程服务器断开
        console.log(`[end] ${req.url}`);
        cltSocket.end();
    });

    // srvSocket.on('timeout', () => {
    //     console.log(`[timeout] ${req.url}`);
    //     srvSocket.end();
    //     cltSocket.end();
    // });

    srvSocket.on('close', (hasError) => {
        // 远程服务器完全断开
        console.log(`[close] ${req.url} ${hasError}`);
        cltSocket.end();
    });

    srvSocket.on('error', (err) => {
        // 远程服务器报错
        console.log(`[error] ${req.url} \r\n${err.stack}`);
        cltSocket.end();
    });
});

proxy.on('listening', () => {
    console.log(`Proxy-Server running at ${PORT}`);
});

// 代理服务器正在运行
proxy.listen(PORT, HOST);