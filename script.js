const generateKeysButton = document.getElementById('generateKeys');
const publicKeyInput = document.getElementById('publicKeyInput');
const privateKeyInput = document.getElementById('privateKeyInput');
const exportPublicKeyButton = document.getElementById('exportPublicKey');
const exportPrivateKeyButton = document.getElementById('exportPrivateKey');
const importPublicKeyInput = document.getElementById('importPublicKey');
const importPrivateKeyInput = document.getElementById('importPrivateKey');
const fileInput = document.getElementById('fileInput');
const encryptButton = document.getElementById('encryptButton');
const decryptButton = document.getElementById('decryptButton');
const statusDiv = document.getElementById('status');

let publicKey = null;
let privateKey = null;

// --- Key Management ---

generateKeysButton.addEventListener('click', async () => {
    try {
        statusDiv.textContent = '正在生成密钥对...';
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
                hash: 'SHA-256',
            },
            true, // 可导出
            ['encrypt', 'decrypt']
        );

        publicKey = keyPair.publicKey;
        privateKey = keyPair.privateKey;

        const spkiPem = await exportKey('spki', publicKey);
        const pkcs8Pem = await exportKey('pkcs8', privateKey);

        publicKeyInput.value = spkiPem;
        privateKeyInput.value = pkcs8Pem;
        statusDiv.textContent = '密钥对生成成功！';
    } catch (error) {
        console.error('密钥生成失败:', error);
        statusDiv.textContent = `密钥生成失败: ${error.message}`;
    }
});

async function exportKey(format, key) {
    const exported = await window.crypto.subtle.exportKey(format, key);
    const exportedAsString = String.fromCharCode.apply(null, new Uint8Array(exported));
    const exportedAsBase64 = btoa(exportedAsString);
    let pemExported;
    if (format === 'spki') {
        pemExported = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    } else if (format === 'pkcs8') {
        pemExported = `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
    }
    return pemExported;
}

function pemToArrayBuffer(pem) {
    const base64String = pem
        .replace(/-----BEGIN (PUBLIC|PRIVATE) KEY-----/, '')
        .replace(/-----END (PUBLIC|PRIVATE) KEY-----/, '')
        .replace(/\s+/g, '');
    const binaryString = atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function importPublicKey(pem) {
    try {
        const arrayBuffer = pemToArrayBuffer(pem);
        return await window.crypto.subtle.importKey(
            'spki',
            arrayBuffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            },
            true,
            ['encrypt']
        );
    } catch (error) {
        console.error('导入公钥失败:', error);
        statusDiv.textContent = `导入公钥失败: ${error.message}`;
        throw error;
    }
}

async function importPrivateKey(pem) {
    try {
        const arrayBuffer = pemToArrayBuffer(pem);
        return await window.crypto.subtle.importKey(
            'pkcs8',
            arrayBuffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256',
            },
            true,
            ['decrypt']
        );
    } catch (error) {
        console.error('导入私钥失败:', error);
        statusDiv.textContent = `导入私钥失败: ${error.message}`;
        throw error;
    }
}

exportPublicKeyButton.addEventListener('click', async () => {
    if (!publicKey) {
        statusDiv.textContent = '请先生成或导入公钥。';
        return;
    }
    try {
        const pem = await exportKey('spki', publicKey);
        downloadFile(pem, 'public_key.pem', 'application/x-pem-file');
        statusDiv.textContent = '公钥已导出。';
    } catch (error) {
        statusDiv.textContent = `导出公钥失败: ${error.message}`;
    }
});

exportPrivateKeyButton.addEventListener('click', async () => {
    if (!privateKey) {
        statusDiv.textContent = '请先生成或导入私钥。';
        return;
    }
    try {
        const pem = await exportKey('pkcs8', privateKey);
        downloadFile(pem, 'private_key.pem', 'application/x-pem-file');
        statusDiv.textContent = '私钥已导出。';
    } catch (error) {
        statusDiv.textContent = `导出私钥失败: ${error.message}`;
    }
});

importPublicKeyInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const pem = e.target.result;
            publicKey = await importPublicKey(pem);
            publicKeyInput.value = pem;
            statusDiv.textContent = '公钥导入成功。';
        } catch (error) {
            // Error handled in importPublicKey
        }
    };
    reader.readAsText(file);
});

importPrivateKeyInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const pem = e.target.result;
            privateKey = await importPrivateKey(pem);
            privateKeyInput.value = pem;
            statusDiv.textContent = '私钥导入成功。';
        } catch (error) {
            // Error handled in importPrivateKey
        }
    };
    reader.readAsText(file);
});

// Update keys if text area content changes manually
publicKeyInput.addEventListener('input', async () => {
    try {
        publicKey = await importPublicKey(publicKeyInput.value);
        statusDiv.textContent = '公钥已更新。';
    } catch (error) {
        publicKey = null;
        // statusDiv.textContent = '无效的公钥格式。'; // Avoid spamming
    }
});

privateKeyInput.addEventListener('input', async () => {
    try {
        privateKey = await importPrivateKey(privateKeyInput.value);
        statusDiv.textContent = '私钥已更新。';
    } catch (error) {
        privateKey = null;
        // statusDiv.textContent = '无效的私钥格式。'; // Avoid spamming
    }
});

// --- File Operations ---

encryptButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
        statusDiv.textContent = '请先选择一个文件。';
        return;
    }
    if (!publicKey) {
        if (publicKeyInput.value) {
            try {
                publicKey = await importPublicKey(publicKeyInput.value);
            } catch (error) {
                statusDiv.textContent = '请提供有效的公钥。';
                return;
            }
        } else {
             statusDiv.textContent = '请先生成或导入公钥。';
             return;
        }
    }

    statusDiv.textContent = '正在加密文件...';
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const fileBuffer = e.target.result;
            // Generate a random symmetric key
            const symmetricKey = await window.crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            // Export the symmetric key
            const exportedSymmetricKey = await window.crypto.subtle.exportKey('raw', symmetricKey);
            // Encrypt the symmetric key with the public key
            const encryptedSymmetricKey = await window.crypto.subtle.encrypt(
                { name: 'RSA-OAEP' },
                publicKey,
                exportedSymmetricKey
            );

            // Encrypt the file content with the symmetric key
            const iv = window.crypto.getRandomValues(new Uint8Array(12)); // AES-GCM recommended IV size
            const encryptedContent = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                symmetricKey,
                fileBuffer
            );

            // Combine encrypted key length, IV length, encrypted key, IV, and encrypted content
            const encryptedKeyLength = new Uint32Array([encryptedSymmetricKey.byteLength]);
            const ivLength = new Uint32Array([iv.byteLength]);
            const combinedBuffer = new Blob([
                encryptedKeyLength, // 4 bytes
                ivLength,           // 4 bytes
                encryptedSymmetricKey, // variable length
                iv,                 // variable length (12 bytes in this case)
                encryptedContent    // variable length
            ]);

            downloadFile(combinedBuffer, `${file.name}.enc`, 'application/octet-stream');
            statusDiv.textContent = '文件加密成功！';
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('加密失败:', error);
        statusDiv.textContent = `文件加密失败: ${error.message}`;
    }
});

decryptButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
        statusDiv.textContent = '请先选择一个加密文件 (.enc)。';
        return;
    }
    if (!privateKey) {
         if (privateKeyInput.value) {
            try {
                privateKey = await importPrivateKey(privateKeyInput.value);
            } catch (error) {
                statusDiv.textContent = '请提供有效的私钥。';
                return;
            }
        } else {
             statusDiv.textContent = '请先生成或导入私钥。';
             return;
        }
    }

    statusDiv.textContent = '正在解密文件...';
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const combinedBuffer = e.target.result;
            const dataView = new DataView(combinedBuffer);

            let offset = 0;
            const encryptedKeyLength = dataView.getUint32(offset, true); // Read as little-endian
            offset += 4;
            const ivLength = dataView.getUint32(offset, true); // Read as little-endian
            offset += 4;

            const encryptedSymmetricKey = combinedBuffer.slice(offset, offset + encryptedKeyLength);
            offset += encryptedKeyLength;
            const iv = combinedBuffer.slice(offset, offset + ivLength);
            offset += ivLength;
            const encryptedContent = combinedBuffer.slice(offset);

            // Decrypt the symmetric key with the private key
            const decryptedSymmetricKeyBytes = await window.crypto.subtle.decrypt(
                { name: 'RSA-OAEP' },
                privateKey,
                encryptedSymmetricKey
            );

            // Import the decrypted symmetric key
            const symmetricKey = await window.crypto.subtle.importKey(
                'raw',
                decryptedSymmetricKeyBytes,
                { name: 'AES-GCM' },
                true,
                ['decrypt']
            );

            // Decrypt the file content with the symmetric key
            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                symmetricKey,
                encryptedContent
            );

            // Determine original file name (remove .enc)
            const originalFileName = file.name.endsWith('.enc')
                ? file.name.slice(0, -4)
                : `decrypted_${file.name}`;

            downloadFile(new Blob([decryptedContent]), originalFileName, 'application/octet-stream');
            statusDiv.textContent = '文件解密成功！';
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('解密失败:', error);
        statusDiv.textContent = `文件解密失败: ${error.message}. 请确保使用了正确的私钥和文件未被篡改。`;
    }
});

// --- Utility Functions ---

function downloadFile(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}