// Only for isolated browser fixtures. Wait before generating; never retry a rejected login.
export async function freshOidcCode({ generate, lastCode, now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  for (let n = 0; n < 130; n++) {
    const timestamp = now();
    // Leave time to fill and submit the form before the IdP's 30-second boundary.
    if (30000 - timestamp % 30000 >= 8000) {
      const token = generate(timestamp);
      if (token !== lastCode) return token;
    }
    await wait(250);
  }
  throw Error('Fresh OTP unavailable');
}
