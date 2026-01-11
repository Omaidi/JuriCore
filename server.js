const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // Parse URL to remove query strings (fixes ?v=2.4 404 error)
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    console.log(`REQ: ${pathname} (original: ${req.url})`);

    // Normalize path to www directory
    let filePath = './www' + pathname;
    if (filePath === './www/' || filePath === './www') {
        filePath = './www/index.html';
    }

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile('./404.html', (error, content) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content || '404 Not Found', 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            });
            res.end(content, 'utf-8');
        }
    });
});

const os = require('os');

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== SERVER JURI PRO BERJALAN ===`);
    console.log(`Akses aplikasi melalui alamat berikut:`);
    console.log(`1. Di Laptop ini: http://localhost:${PORT}/`);

    // Get LAN IP
    const interfaces = os.networkInterfaces();
    let hasIp = false;
    for (let k in interfaces) {
        for (let k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                console.log(`2. Di HP (Satu WiFi): http://${address.address}:${PORT}/`);
                hasIp = true;
            }
        }
    }
    if (!hasIp) console.log("   (Tidak ada IP WiFi terdeteksi. Pastikan terhubung internet!)");

    console.log('---------------------------------');
    console.log('Tekan Ctrl+C untuk berhenti.');
});
