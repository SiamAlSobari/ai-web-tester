# Privacy Policy

**AI Web Tester (`ai-web-tester`)** is committed to protecting your privacy and ensuring complete transparency about data handling.

## 1. Local-First Architecture
* **No Cloud Telemetry or Tracking**: `ai-web-tester` executes 100% locally on your machine or CI runner. It does NOT send user data, browsing history, telemetry, or test reports to any third-party external server or remote endpoint.
* **Open Source & Transparent**: All source code is publicly accessible and auditable under the MIT License.

## 2. Browser Data & Artifacts
* **Local Storage Only**: All generated test artifacts (screenshots, Playwright traces, downloaded files, and Markdown test reports) are stored exclusively in your local project workspace under `./artifacts` and `./test-reports`.
* **Authentication States**: Any authentication states saved via `browser_save_auth` (cookies, tokens, and localStorage) are stored locally in your specified directory in plain JSON format. You have full control over these files and should ensure sensitive credentials are not committed to public version control.

## 3. Network Communication
* `ai-web-tester` only communicates with the target URLs that you explicitly instruct it to navigate to (such as `http://localhost:3000` or your web application endpoints).
* It does not connect to external analytics, tracking pixels, or remote telemetry servers.

## 4. Contact & Disclosures
For any privacy inquiries or feedback, please open an issue on the official GitHub repository:
https://github.com/SiamAlSobari/ai-web-tester
