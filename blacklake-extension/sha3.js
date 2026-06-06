// SHA3-224（Keccak，BigInt 实现）—— 浏览器 Web Crypto 不支持 SHA3，故自带。已对齐 Node crypto 验证。
const MASK = (1n << 64n) - 1n
const rol = (x, n) => ((x << n) | (x >> (64n - n))) & MASK
const RC = [0x1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n]
const R = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]]
function keccakF(A) {
  for (let rnd = 0; rnd < 24; rnd++) {
    const C = [0n,0n,0n,0n,0n]
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x+5] ^ A[x+10] ^ A[x+15] ^ A[x+20]
    const D = [0n,0n,0n,0n,0n]
    for (let x = 0; x < 5; x++) D[x] = C[(x+4)%5] ^ rol(C[(x+1)%5], 1n)
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x+5*y] ^= D[x]
    const B = new Array(25).fill(0n)
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y+5*((2*x+3*y)%5)] = rol(A[x+5*y], BigInt(R[x][y]))
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x+5*y] = B[x+5*y] ^ ((~B[((x+1)%5)+5*y]) & B[((x+2)%5)+5*y] & MASK)
    A[0] ^= RC[rnd]
  }
}
/** 字符串 → SHA3-224 十六进制串。 */
function sha3_224(str) {
  const bytes = [...new TextEncoder().encode(str)]
  const rate = 144
  const A = new Array(25).fill(0n)
  bytes.push(0x06)
  while (bytes.length % rate !== 0) bytes.push(0x00)
  bytes[bytes.length - 1] ^= 0x80
  for (let off = 0; off < bytes.length; off += rate) {
    for (let i = 0; i < rate; i++) A[Math.floor(i/8)] ^= BigInt(bytes[off+i]) << BigInt((i%8)*8)
    keccakF(A)
  }
  let hex = ''
  for (let i = 0; i < 28; i++) hex += Number((A[Math.floor(i/8)] >> BigInt((i%8)*8)) & 0xffn).toString(16).padStart(2, '0')
  return hex
}
