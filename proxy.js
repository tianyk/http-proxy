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
    const cUrl = cReq.url;
    console.log(cUrl);

    // 代理模式
    if (cUrl.startsWith('http')) {
        const { method, headers } = cReq;
        const { hostname, port = 80, path } = url.parse(cReq.url);

        // via
        let via = headers['via'];
        if (via) {
            via = via += ', 1.1 proxy.kekek.cc';
        } else {
            via = '1.1 proxy.kekek.cc (Node.js-Proxy)';
        }
        headers['via'] = via;

        // x-forward-for
        let ips = headers['x-forward-for'];
        if (ips) {
            ips += `, ${MY_IP}`;
        } else {
            ips = MY_IP;
        }
        headers['x-forward-for'] = ips;

        // Max-Forwards

        const pReq = http.request({ hostname, port, path, method, headers });
        pReq
            .on('response', (pRes) => {
                console.log(`[response] [proxy] ${cUrl}`);
                cRes.writeHead(pRes.statusCode, pRes.headers);
                pRes.pipe(cRes);
            })
            .on('abort', () => {
                console.log(`[abort] [proxy] ${cUrl}`);
            })
            .on('timeout', () => {
                cRes.end();
            })
            .on('close', () => {
                console.log(`[close] [proxy] ${cUrl}`);
            })
            .on('error', (err) => {
                console.log(`[error] [proxy] ${cUrl} \r\n${err.stack}`);
                cRes.end();
            });

        cReq.pipe(pReq);

        // 客户端中止
        cReq.on('aborted', () => {
            console.log(`[aborted] [client] ${cUrl}`);
            // 中止代理
            pReq.abort();
        });

        // TODO 客户端提前断开
        // cRes.on('close', () => {
        //     console.log(`[close] [client] ${cUrl}`);
        // });
    } else {
        // http-server
        if (cUrl === '/proxy.pac') {
            response.setHeader('content-type', 'application/x-ns-proxy-autoconfig');
            const pac = `// Proxy Auto-Configuration (PAC) file
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_(PAC)_file
// DIRECT	        不经过任何代理，直接进行连接
// PROXY host:port	应该使用指定的代理
// SOCKS host:port	应该使用指定的 SOCKS 服务器
// HTTP host:port   
// HTTPS host:port  
// SOCKS4 host:port
// SOCKS5 host:port

var proxy = "HTTP proxy.kekek.cc:1337; HTTPS proxy.kekek.cc:1337";
var direct = 'DIRECT;';
function FindProxyForURL(url, host){
    if (host === 'ccs.51talk.com') {
        return proxy;
    } else {
        return direct;
    }
}`;
            res.end(pac);
        } else {
            response.setHeader('content-type', 'text/plain');
            cRes.end('proxy: proxy.kekek.cc\r\nport: 1337');
        }
    }
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