# Google Search Console — Option B (HTML tag)

## 1. Search Console se code lo
1. https://search.google.com/search-console
2. **Add property** → **URL prefix** → apni live URL (`https://....`)
3. Verification method: **HTML tag**
4. Google aisa line dega:

```html
<meta name="google-site-verification" content="AbCdEf123456..." />
```

5. Sirf `content="..."` ke **andar ka code** copy karo (quotes ke beech).

## 2. Project mein paste
In teen files mein yeh line hai:

- `index.html`
- `auth.html`
- `reset-password.html`

`PASTE_YOUR_GOOGLE_VERIFICATION_CODE_HERE` hatao aur apna code likho:

```html
<meta name="google-site-verification" content="AbCdEf123456...">
```

## 3. Deploy
Vercel / Firebase pe dubara deploy karo.

## 4. Verify
Search Console → **Verify**.

## 5. Indexing
URL Inspection → homepage URL → **Request indexing**.
