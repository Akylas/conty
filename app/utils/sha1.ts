function rotateLeft(value: number, bits: number) {
    return (value << bits) | (value >>> (32 - bits));
}

/** SHA-1 hex digest of an ASCII string (only used to sign Podcast Index requests). */
export function sha1(message: string) {
    const bytes: number[] = [];
    for (let index = 0; index < message.length; index++) {
        bytes.push(message.charCodeAt(index) & 0xff);
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
        bytes.push(0);
    }
    // 64 bits big endian length, messages are far below 2^32 bits
    bytes.push(0, 0, 0, 0, (bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff);

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;
    const words = new Array<number>(80);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let index = 0; index < 16; index++) {
            const position = offset + index * 4;
            words[index] = (bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3];
        }
        for (let index = 16; index < 80; index++) {
            words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        for (let index = 0; index < 80; index++) {
            let f: number;
            let k: number;
            if (index < 20) {
                f = (b & c) | (~b & d);
                k = 0x5a827999;
            } else if (index < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            } else if (index < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc;
            } else {
                f = b ^ c ^ d;
                k = 0xca62c1d6;
            }
            const temp = (rotateLeft(a, 5) + f + e + k + words[index]) | 0;
            e = d;
            d = c;
            c = rotateLeft(b, 30);
            b = a;
            a = temp;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }
    return [h0, h1, h2, h3, h4].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}
