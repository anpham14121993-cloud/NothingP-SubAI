        // NothingP AIOsubtitles v3.9.69 — 20K/120 + 5 in-flight/key + 15 RPM/key + fast timeout fallback + Gate Cross-Instance Fix
        const express = require('express');
        const axios = require('axios');
        const cors = require('cors');
        const AdmZip = require('adm-zip');

        // v3.9.67: Vercel-safe background execution.
        // Render keeps the Node process alive naturally; Vercel Fluid Compute requires
        // waitUntil() to keep post-response work attached to the invocation lifecycle.
        let vercelWaitUntil = null;
        if (process.env.VERCEL) {
          try {
            vercelWaitUntil = require('@vercel/functions').waitUntil;
          } catch (err) {
            console.warn('[Vercel waitUntil] unavailable:', err.message || err);
          }
        }

        const app = express();
        app.use(cors());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        const PORT = process.env.PORT || 3000;
        const SUBSOURCE_API = 'https://api.subsource.net/api/v1';
        const API_HEADERS = {
          'User-Agent': 'AISubtitlePro v3.9.9',
          Accept: 'application/json'
        };
        const SUBTITLE_BROWSER_HEADERS = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          'Accept': 'text/plain,text/vtt,text/*,*/*;q=0.8'
        };

        function parseConfig(encodedConfig) {
          if (!encodedConfig || encodedConfig === 'undefined' || encodedConfig === 'null') return {};
          const raw = String(encodedConfig).trim();
          const variants = [
            raw,
            raw.replace(/-/g, '+').replace(/_/g, '/'),
            decodeURIComponent(raw)
          ];
          for (const value of variants) {
            try {
              const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
              const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
              if (parsed && typeof parsed === 'object') return parsed;
            } catch {}
          }
          try {
            const parsed = JSON.parse(decodeURIComponent(raw));
            if (parsed && typeof parsed === 'object') return parsed;
          } catch {}
          return {};
        }

        function escapeHtml(value) {
          return String(value || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[char]));
        }

        app.get('/', (req, res) => res.redirect('/configure'));
        app.get('/configure', (req, res) => renderConfigPage(req, res, {}));
        app.get('/:config/configure', (req, res) => {
          renderConfigPage(req, res, parseConfig(req.params.config));
        });

        function renderConfigPage(req, res, savedConfig) {
          const geminiKeys = savedConfig.geminiKeys || [];
          res.send(`<!DOCTYPE html>
        <html lang="vi">
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Cấu hình NothingP AIOsubtitles</title>
        <style>
        body{background:#121212;color:#fff;font-family:Arial,sans-serif;padding:20px;display:flex;justify-content:center}
        .container{width:100%;max-width:520px;background:#1e1e1e;padding:25px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.5)}
        h2{text-align:center;color:#ff5252;margin-bottom:20px}
        label{display:block;margin:12px 0 5px;font-size:13px;color:#ccc}
        input,select{width:100%;padding:10px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:5px;box-sizing:border-box}
        .section-title{color:#4fc3f7;margin-top:20px;font-size:14px;font-weight:bold;border-bottom:1px solid #333;padding-bottom:5px}
        button{width:100%;padding:12px;border:0;border-radius:5px;color:#fff;font-weight:bold;margin-top:15px;cursor:pointer;font-size:14px}
        #installBtn{background:#e50914}#copyBtn{background:#2196F3}
        </style>
        </head>
        <body>
        <div class="container">
        <h2>NothingP AIOsubtitles v3.9.67</h2>
        <form id="configForm">
        <label>Mô hình AI dịch ưu tiên:</label>
        <select id="modelSelect">
        <option value="gemini-3.5-flash-lite" ${!savedConfig.model || savedConfig.model === 'gemini-3.5-flash-lite' ? 'selected' : ''}>Gemini 3.5 Flash-Lite - Low thinking (Khuyên dùng)</option>
        <option value="gemini-2.5-flash" ${savedConfig.model === 'gemini-2.5-flash' ? 'selected' : ''}>Gemini 2.5 Flash - Dự phòng</option>
        </select>
        <div class="section-title">🔑 Google Gemini API Keys (Hỗ trợ xoay vòng nhiều Key)</div>
        <label>Gemini API Key 1</label><input id="geminiKey1" value="${escapeHtml(geminiKeys[0])}" placeholder="AIzaSy...">
        <label>Gemini API Key 2</label><input id="geminiKey2" value="${escapeHtml(geminiKeys[1])}">
        <label>Gemini API Key 3</label><input id="geminiKey3" value="${escapeHtml(geminiKeys[2])}">
        <div style="font-size:12px;color:#aaa;margin-top:8px;line-height:1.45">v3.9.1: 3 Key thuộc 3 Google Project khác nhau sẽ chạy 3 worker dịch song song. Mỗi Project có limiter riêng.</div>
        <div class="section-title">📥 Nguồn phụ đề (OpenSubtitles, SubSource, SubDL)</div>
        <label>OpenSubtitles API Key</label><input id="opensubtitlesKey" value="${escapeHtml(savedConfig.opensubtitlesKey)}">
        <label>SubSource API Key</label><input id="subsourceKey" value="${escapeHtml(savedConfig.subsourceKey)}" placeholder="Nhập SubSource API Key">
        <label>SubDL API Key</label><input id="subdlKey" value="${escapeHtml(savedConfig.subdlKey)}">
        <button type="button" id="installBtn">Cài đặt trực tiếp vào Stremio</button>
        <label style="margin-top:20px">Link Addon:</label><input id="addonUrlOutput" readonly>
        <button type="button" id="copyBtn">📋 Sao chép Link Addon</button>
        </form>
        </div>
        <script>
        function getAddonUrl(){
          const config={
            model:document.getElementById('modelSelect').value,
            geminiKeys:['geminiKey1','geminiKey2','geminiKey3'].map(id=>document.getElementById(id).value.trim()).filter(Boolean),
            opensubtitlesKey:document.getElementById('opensubtitlesKey').value.trim(),
            subdlKey:document.getElementById('subdlKey').value.trim(),
            subsourceKey:document.getElementById('subsourceKey').value.trim()
          };
          return location.origin+'/'+btoa(unescape(encodeURIComponent(JSON.stringify(config))))+'/manifest.json';
        }
        document.getElementById('installBtn').onclick=()=>{
          location.href='stremio://'+getAddonUrl().replace(/^https?:\\/\\//,'');
        };
        document.getElementById('copyBtn').onclick=async()=>{
          const url=getAddonUrl(), input=document.getElementById('addonUrlOutput');
          input.value=url; input.select();
          try{await navigator.clipboard.writeText(url);alert('Đã sao chép link addon!')}
          catch{alert('Hãy sao chép link trong ô.')}
        };
        document.getElementById('addonUrlOutput').value = getAddonUrl();
        </script>
        </body>
        </html>`);
        }

        // v3.9.34: per-episode job isolation + source-timestamp-locked SRT + seek-safe subtitle output.
        // v3.9.31: Android TV subtitle playback + click-trigger translation fix.
        // v3.9.30: deterministic provider order for the configuration page.
        // This is separate from the subtitle-picker order.
        const CONFIG_PROVIDER_ORDER = ['os', 'subsource', 'subdl'];
        const configProviderRank = value => {
          const id = String(value || '').toLowerCase();
          return CONFIG_PROVIDER_ORDER.indexOf(id) >= 0
            ? CONFIG_PROVIDER_ORDER.indexOf(id)
            : CONFIG_PROVIDER_ORDER.length;
        };

        const defaultManifest = {
          id: 'org.gemini.ai.subtitle.pro',
          version: '3.9.67',
          name: 'NothingP AIOsubtitles',
          description: 'Tự động tìm sub Việt chuẩn hoặc dịch AI với sổ tay nhân vật, quan hệ và xưng hô theo bối cảnh.',
          types: ['movie', 'series'],
          catalogs: [],
          resources: ['subtitles'],
          idPrefixes: ['tt'],
          configurable: true,
          behaviorHints: { configurable: true }
        };

        app.get('/healthz', (req, res) => {
          res.status(200).json({ ok: true, version: '3.9.67', uptime: Math.round(process.uptime()) });
        });

        app.get('/manifest.json', (req, res) => res.json(defaultManifest));
        app.get('/:config/manifest.json', (req, res) => res.json(defaultManifest));

        function makeHostUrl(req) {
          const forwardedProto = req.get('x-forwarded-proto');
          const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
          return `${protocol}://${req.get('host')}`;
        }

        function languageCode(value) {
          if (value && typeof value === 'object') {
            value = value.code || value.language_code || value.iso639_2 || value.iso639_1 ||
              value.lang || value.language || value.name || '';
          }
          return String(value || '').trim().toLowerCase();
        }

        function isVietnamese(value) {
          const code = languageCode(value);
          return ['vi', 'vie', 'vnm', 'vn', 'vietnamese', 'vietnam'].includes(code) ||
            code.startsWith('vi-') || code.startsWith('vi_') || code.includes('viet');
        }

        function isEnglish(value) {
          const code = languageCode(value);
          return code === 'en' || code === 'eng' || code === 'english';
        }


        // v3.9.31: Android TV / Media3-safe SRT normalization.
        // Gemini is allowed to translate text only; timestamps are taken from the
        // original subtitle and validated again before the final file is returned.
        function parseSrtCues(input) {
          const raw = String(input || '')
            .replace(/^\uFEFF/, '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/```(?:srt|subtitle|text)?/gi, '')
            .replace(/```/g, '');

          const blocks = raw.split(/\n{2,}/);
          const cues = [];

          const toMs = value => {
            const m = String(value || '').trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
            if (!m) return null;
            const h = Number(m[1]);
            const min = Number(m[2]);
            const sec = Number(m[3]);
            let ms = String(m[4]);
            if (ms.length === 1) ms += '00';
            else if (ms.length === 2) ms += '0';
            ms = Number(ms);
            if (min > 59 || sec > 59 || ms > 999) return null;
            return (((h * 60 + min) * 60 + sec) * 1000) + ms;
          };

          for (const block of blocks) {
            const lines = block.split('\n');
            if (lines.length < 2) continue;
            const timeIndex = lines.findIndex(line =>
              /^\s*\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}(?:\s+.*)?\s*$/.test(line)
            );
            if (timeIndex < 0) continue;

            const tm = lines[timeIndex].match(
              /^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})/
            );
            if (!tm) continue;
            const start = toMs(tm[1]);
            const end = toMs(tm[2]);
            if (start == null || end == null || end <= start) continue;

            const body = lines.slice(timeIndex + 1).join('\n').trim();
            if (!body) continue;
            cues.push({ start, end, body });
          }

          return cues;
        }

        function srtMs(ms) {
          ms = Math.max(0, Math.round(Number(ms) || 0));
          const h = Math.floor(ms / 3600000);
          ms %= 3600000;
          const m = Math.floor(ms / 60000);
          ms %= 60000;
          const s = Math.floor(ms / 1000);
          const milli = ms % 1000;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
        }

        function buildSrtFromCues(cues) {
          const unique = [];
          const seen = new Set();
          for (const cue of cues || []) {
            if (!cue || cue.start == null || cue.end == null || cue.end <= cue.start) continue;
            const body = String(cue.body || '').trim();
            if (!body) continue;
            const key = `${cue.start}|${cue.end}|${body}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({ start: cue.start, end: cue.end, body });
          }
          unique.sort((a, b) => a.start - b.start || a.end - b.end);
          return unique.map((cue, i) =>
            `${i + 1}\n${srtMs(cue.start)} --> ${srtMs(cue.end)}\n${cue.body}`
          ).join('\n\n') + (unique.length ? '\n' : '');
        }

        function normalizeSrtForPlayback(input) {
          // Final safety pass for Android/Media3: strict timestamps, UTF-8 cleanup,
          // deterministic ordering, duplicate removal, and continuous numbering.
          return buildSrtFromCues(parseSrtCues(input));
        }

        function rebuildTranslatedSrtFromSource(sourceChunks, translatedChunks) {
          // CRITICAL v3.9.34:
          // Gemini may occasionally alter/duplicate timestamps while translating.
          // Never trust Gemini's timeline. The ORIGINAL subtitle is the sole source of
          // truth for start/end times. Each translated chunk is aligned by cue order.
          // v3.9.36: use the EXACT chunk array that was sent to Gemini.
          // Re-splitting the original SRT with a different maxChars value caused
          // false mismatches such as source=4 chunks vs translated=7 chunks.
          const finalCues = [];

          const cleanBody = value => String(value || '')
            .replace(/```(?:srt|subtitle|text)?/gi, '')
            .replace(/```/g, '')
            .trim();

          const ordered = [...(translatedChunks || [])].sort((a, b) => a.index - b.index);
          if (ordered.length !== sourceChunks.length) {
            throw new Error(`SRT chunk mismatch: nguồn=${sourceChunks.length}, bản dịch=${ordered.length}`);
          }

          for (let i = 0; i < sourceChunks.length; i++) {
            const sourceCues = parseSrtCues(sourceChunks[i]);
            const translatedCues = parseSrtCues(ordered[i].text);
            if (!sourceCues.length) continue;
            if (translatedCues.length !== sourceCues.length) {
              throw new Error(`Chunk ${i + 1}: số cue không khớp (nguồn=${sourceCues.length}, dịch=${translatedCues.length})`);
            }

            for (let j = 0; j < sourceCues.length; j++) {
              if (translatedCues[j].start !== sourceCues[j].start || translatedCues[j].end !== sourceCues[j].end) {
                throw new Error(`Chunk ${i + 1}, cue ${j + 1}: timestamp mismatch nguồn=${srtMs(sourceCues[j].start)} --> ${srtMs(sourceCues[j].end)} | dịch=${srtMs(translatedCues[j].start)} --> ${srtMs(translatedCues[j].end)}`);
              }
              const translatedBody = cleanBody(translatedCues[j].body);
              if (!translatedBody) {
                throw new Error(`Chunk ${i + 1}, cue ${j + 1}: bản dịch rỗng`);
              }
              finalCues.push({
                start: sourceCues[j].start,
                end: sourceCues[j].end,
                body: translatedBody
              });
            }
          }

          return buildSrtFromCues(finalCues);
        }

        function subtitleName(sub, fallback) {
          // v3.9.30: Resolve the actual release name exposed by each provider.
          // Different APIs use different field names/casing, so keep all known variants
          // before falling back to the subtitle filename/name.
          const candidates = [
            sub?.releaseName,
            sub?.release_name,
            sub?.release,
            sub?.releaseInfo,
            sub?.release_info,
            sub?.attributes?.releaseName,
            sub?.attributes?.release_name,
            sub?.attributes?.release,
            sub?.fileName,
            sub?.file_name,
            sub?.name
          ];

          for (const value of candidates) {
            if (Array.isArray(value)) {
              const joined = value
                .map(v => typeof v === 'object' ? (v?.name || v?.title || v?.value || '') : String(v || ''))
                .filter(Boolean)
                .join(' ')
                .trim();
              if (joined) return joined;
              continue;
            }

            if (value && typeof value === 'object') {
              const nested = value.name || value.title || value.value || value.releaseName || value.release_name;
              if (nested) return String(nested).trim();
              continue;
            }

            const result = String(value || '').trim();
            if (result) return result;
          }

          return String(fallback || '').trim();
        }

        function subtitlePickerId(releaseName, fallback, season = null, episode = null) {
          // v3.9.72: scope subtitle IDs to the current episode. Nuvio/Stremio can
          // retain a subtitle selection by `id` while moving from one episode to the
          // next. Reusing the same release-name ID can therefore make S02E04's
          // subtitle appear/request again when S02E05 is opened before a new
          // subtitle is selected. Keep the human-readable release name, but append
          // a deterministic episode scope so every episode has a distinct identity.
          const base = String(releaseName || fallback || 'Subtitle').trim();
          if (season == null || episode == null || Number.isNaN(Number(season)) || Number.isNaN(Number(episode))) {
            return base;
          }
          const s = String(Number(season)).padStart(2, '0');
          const e = String(Number(episode)).padStart(2, '0');
          return `${base} [S${s}E${e}]`;
        }

        function subtitleDisplayName(releaseName, language, provider) {
          // v3.9.30: show language + subtitle source + the real release name.
          // Example: 🇻🇳 OpenSubtitles WEB-DL 1080p
          const name = String(releaseName || 'Subtitle')
            .replace(/\\s+/g, ' ')
            .trim();

          const code = languageCode(language);
          const flag = code === 'vi' || code === 'vie' || code === 'vietnamese'
            ? '🇻🇳'
            : (code === 'en' || code === 'eng' || code === 'english' ? '🇬🇧' : '');

          const providerNames = {
            os: 'OpenSubtitles',
            opensubtitles: 'OpenSubtitles',
            subsource: 'SubSource',
            subdl: 'SubDL'
          };
          const source = providerNames[String(provider || '').toLowerCase()]
            || String(provider || '').trim();

          const parts = [];
          if (flag) parts.push(flag);
          if (source) parts.push(source);
          if (name) parts.push(name);

          return parts.length ? parts.join(' • ') : 'Subtitle';
        }

        function extractSubtitleText(buffer) {
          const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
          const isZip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;

          if (!isZip) {
            return data.toString('utf8').replace(/^\uFEFF/, '');
          }

          const entries = new AdmZip(data).getEntries().filter(entry =>
            !entry.isDirectory && /\.(srt|vtt|ass|ssa|sub)$/i.test(entry.entryName)
          );

          const selected = entries.find(e => /\.srt$/i.test(e.entryName)) || entries[0];
          if (!selected) throw new Error('ZIP không chứa file phụ đề hỗ trợ');

          return selected.getData().toString('utf8').replace(/^\uFEFF/, '');
        }

        async function fetchSubtitleText(url, headers = {}, timeout = 30000, retries = 2) {
          let lastError;
          for (let attempt = 0; attempt <= retries; attempt++) {
            try {
              const response = await axios.get(url, {
                headers,
                responseType: 'arraybuffer',
                timeout,
                maxRedirects: 5,
                validateStatus: status => status >= 200 && status < 300
              });
              return extractSubtitleText(Buffer.from(response.data));
            } catch (err) {
              lastError = err;
              const status = err.response?.status;
              const retryable =
                !status || status === 408 || status === 425 || status === 429 ||
                status >= 500 ||
                /ECONNRESET|ETIMEDOUT|ECONNABORTED|EAI_AGAIN|socket hang up/i.test(
                  String(err.code || '') + ' ' + String(err.message || '')
                );
              if (!retryable || attempt >= retries) break;
              await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
            }
          }
          throw lastError || new Error('Không tải được phụ đề.');
        }

        function getSubsourceHeaders(apiKey) {
          return {
            ...API_HEADERS,
            'X-API-Key': String(apiKey || '')
          };
        }

        async function fetchSubsourceSubtitleText(subtitleId, apiKey) {
          const response = await axios.get(
            `${SUBSOURCE_API}/subtitles/${encodeURIComponent(subtitleId)}/download`,
            {
              headers: getSubsourceHeaders(apiKey),
              responseType: 'arraybuffer',
              timeout: 30000,
              maxRedirects: 5
            }
          );
          return extractSubtitleText(Buffer.from(response.data));
        }

        function splitSrtIntoChunks(srt, maxChars = 16000, maxCues = 150) {
          // v3.9.48: larger chunks reduce Gemini calls while preserving a hard cue cap.
          // Never split an individual SRT cue block.
          const blocks = srt.replace(/\r/g, '').trim().split(/\n\s*\n/).filter(Boolean);
          const chunks = [];
          let current = '';
          let cueCount = 0;
          for (const block of blocks) {
            const blockCues = parseSrtCues(block).length || 1;
            const nextChars = current ? current.length + block.length + 2 : block.length;
            if (current && (nextChars > maxChars || cueCount + blockCues > maxCues)) {
              chunks.push(current); current = ''; cueCount = 0;
            }
            current += (current ? '\n\n' : '') + block;
            cueCount += blockCues;
          }
          if (current) chunks.push(current);
          return chunks.length ? chunks : [srt];
        }

        function splitSrtByCueCount(srt, maxCues = 50) {
          const blocks = srt.replace(/\r/g, '').trim().split(/\n\s*\n/).filter(Boolean);
          const chunks = [];
          let current = '';
          let cueCount = 0;
          for (const block of blocks) {
            const blockCues = parseSrtCues(block).length || 1;
            if (current && cueCount + blockCues > maxCues) {
              chunks.push(current); current = ''; cueCount = 0;
            }
            current += (current ? '\n\n' : '') + block;
            cueCount += blockCues;
          }
          if (current) chunks.push(current);
          return chunks.length ? chunks : [srt];
        }

        function parseTimeToMs(timeStr) {
          if (!timeStr) return 0;
          const parts = timeStr.trim().split(':');
          if (parts.length < 3) return 0;
          const h = parseInt(parts[0], 10) || 0;
          const m = parseInt(parts[1], 10) || 0;
          const sParts = parts[2].split(/[,.]/);
          const s = parseInt(sParts[0], 10) || 0;
          const ms = parseInt((sParts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
          return h * 3600000 + m * 60000 + s * 1000 + ms;
        }

        function cleanAndRebuildSrt(srtText) {
          // Kept for backward compatibility with older helper calls.
          return normalizeSrtForPlayback(srtText);
        }

        // Each API key has an independent rolling 15-request/60-second budget.
        // IMPORTANT: this is a REQUEST-START limiter only. It does NOT serialize HTTP
        // calls and it does NOT cap in-flight/concurrent requests on the same key.
        // A key may start up to 15 requests as fast as possible; after that, only the
        // next start on that key waits for the oldest start to leave the rolling window.
        const GEMINI_MAX_REQUESTS_PER_MINUTE = 15;
        const GEMINI_WINDOW_MS = 60000;
        // v3.9.60: hard cap the number of HTTP requests that can be in-flight on one
        // Gemini key. The old version only limited request STARTS, so a bad chunk could
        // launch dozens of repair requests at once and overload the Node/HTTP stack.
        const GEMINI_MAX_IN_FLIGHT_PER_KEY = 10;
        // v3.9.63: do not let one stalled Gemini request hold a key slot for 60s.
        // Timeout is treated as transient and immediately rotates to the next key.
        const GEMINI_REQUEST_TIMEOUT_MS = 30000;
        const geminiKeyState = new Map();

        function getGeminiKeyState(key) {
          if (!geminiKeyState.has(key)) {
            geminiKeyState.set(key, { starts: [], inFlight: 0, waiters: [] });
          }
          return geminiKeyState.get(key);
        }

        async function acquireGeminiKeyConcurrency(key) {
          const state = getGeminiKeyState(key);
          if (state.inFlight < GEMINI_MAX_IN_FLIGHT_PER_KEY) {
            state.inFlight++;
            return;
          }
          await new Promise(resolve => state.waiters.push(resolve));
          state.inFlight++;
        }

        function releaseGeminiKeyConcurrency(key) {
          const state = getGeminiKeyState(key);
          state.inFlight = Math.max(0, state.inFlight - 1);
          const next = state.waiters.shift();
          if (next) next();
        }

        function pruneRequestStarts(starts, now = Date.now()) {
          while (starts.length && now - starts[0] >= GEMINI_WINDOW_MS) starts.shift();
        }

        // Reserve the request-start slot BEFORE the network call. There is deliberately
        // no await between the quota check and starts.push(), so two callers cannot both
        // observe the same free slot in Node's single-threaded event loop.
        async function reserveGeminiRequestSlot(key) {
          const state = getGeminiKeyState(key);
          while (true) {
            const now = Date.now();
            pruneRequestStarts(state.starts, now);
            if (state.starts.length < GEMINI_MAX_REQUESTS_PER_MINUTE) {
              state.starts.push(now);
              return;
            }
            const waitMs = GEMINI_WINDOW_MS - (now - state.starts[0]) + 25;
            await new Promise(r => setTimeout(r, Math.max(25, waitMs)));
          }
        }

        async function withGeminiKeySlot(key, fn) {
          // Acquire in-flight capacity BEFORE reserving the RPM slot. Waiting for a free
          // connection must never consume a request-start quota slot.
          await acquireGeminiKeyConcurrency(key);
          try {
            await reserveGeminiRequestSlot(key);
            return await fn();
          } finally {
            releaseGeminiKeyConcurrency(key);
          }
        }

        async function callAI(prompt, geminiKeys, model, startKeyIndex = 0, keyIndexMap = null) {
          let lastError = 'Lỗi không xác định';
          const keys = [...new Set((geminiKeys || []).filter(Boolean))];

          if (!keys.length) {
            return { result: '', error: 'Thiếu Gemini API Key.' };
          }

          // v3.9.11: try ALL keys on the SELECTED MODEL first.
          // Do not switch models from inside this function.
          const selectedModel = model || 'gemini-3.5-flash-lite';

          const start = keys.length ? ((Number(startKeyIndex) || 0) % keys.length + keys.length) % keys.length : 0;
          for (let offset = 0; offset < keys.length; offset++) {
            const keyIndex = (start + offset) % keys.length;
            const key = keys[keyIndex];
            for (let attempt = 0; attempt < 1; attempt++) {
              try {
                const response = await withGeminiKeySlot(key, async () => {
                  const url =
                    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(key)}`;

                  return axios.post(url, {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: String(selectedModel).startsWith('gemini-3.')
                      ? { thinkingConfig: { thinkingLevel: 'low' } }
                      : { temperature: 0.2 }
                  }, {
                    timeout: GEMINI_REQUEST_TIMEOUT_MS,
                    headers: { 'Content-Type': 'application/json' }
                  });
                });

                const result = response.data?.candidates?.[0]?.content?.parts
                  ?.map(p => p.text || '')
                  .join('')
                  .trim();

                if (result) {
                  const actualKeyIndex = Array.isArray(keyIndexMap) && Number.isInteger(keyIndexMap[keyIndex])
                    ? keyIndexMap[keyIndex]
                    : keyIndex;
                  console.log(`[Gemini ${selectedModel} / key #${actualKeyIndex + 1}] success`);
                  return { result, error: null, model: selectedModel, keyIndex: actualKeyIndex };
                }

                lastError = `Gemini ${selectedModel}: không trả về nội dung`;
                break;
              } catch (err) {
                const status = err.response?.status;
                const message =
                  err.response?.data?.error?.message ||
                  err.message ||
                  `Gemini ${selectedModel}: lỗi không xác định`;

                lastError = message;
                const actualKeyIndex = Array.isArray(keyIndexMap) && Number.isInteger(keyIndexMap[keyIndex])
                  ? keyIndexMap[keyIndex]
                  : keyIndex;
                console.error(`[Gemini ${selectedModel} / key #${actualKeyIndex + 1}]`, message);

                if (
                  status === 401 || status === 403 ||
                  /invalid authentication credentials|api key not valid|invalid api key|authentication|unauthorized|permission denied/i.test(message)
                ) {
                  console.warn(`[Gemini ${selectedModel}] key #${actualKeyIndex + 1} authentication failure; trying next key on SAME model.`);
                  break;
                }

                if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) {
                  // A 429 may be a short RPM/TPM burst limit. The hard limiter prevents
                  // normal bursts, but an upstream Retry-After should still be honored.
                  const retryAfter = Number(err.response?.headers?.['retry-after']);
                  if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 15) {
                    console.warn(`[Gemini ${selectedModel}] key #${actualKeyIndex + 1} 429; waiting ${retryAfter}s before rotating.`);
                    await new Promise(r => setTimeout(r, retryAfter * 1000));
                  } else {
                    console.warn(`[Gemini ${selectedModel}] key #${actualKeyIndex + 1} rate/quota limit; rotating to next key.`);
                  }
                  break;
                }

                // Gemini "high demand" is usually model-side capacity pressure, not a
                // temporary network failure. Retrying the same key wastes time and can
                // make the request queue longer, so move to the next project/key immediately.
                if (/high demand/i.test(message)) {
                  console.warn(`[Gemini ${selectedModel}] key #${actualKeyIndex + 1} high-demand response; immediately trying next key on SAME model.`);
                  break;
                }

                if (
                  status === 408 || status === 425 || status === 500 || status === 502 ||
                  status === 503 || status === 504 ||
                  /temporarily unavailable|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(message)
                ) {
                  console.warn(`[Gemini ${selectedModel}] key #${actualKeyIndex + 1} transient failure; immediately trying next key on SAME model.`);
                  break;
                }

                break;
              }
            }
          }

          return {
            result: '',
            error: `Gemini ${selectedModel} failed on all ${keys.length} key(s): ${lastError}`,
            failedAllKeys: true
          };
        }

        async function callAIWithKey(prompt, key, model, keyIndexMap = null) {
          if (!key) return { result: '', error: 'Thiếu Gemini API Key.' };
          return callAI(prompt, [key], model, 0, keyIndexMap);
        }

        async function callAIWithModelFallback(prompt, geminiKeys, primaryModel, startKeyIndex = 0, keyIndexMap = null) {
          // Per-chunk fallback:
          // 1) Gemini 3.5 Flash-Lite is always tried first when it is the configured primary.
          // 2) If that request fails, the SAME chunk is retried with Gemini 2.5 Flash.
          // 3) callAI() keeps the existing 3-key rotation and per-key limiter.
          const requested = primaryModel || 'gemini-3.5-flash-lite';

          const fallbackModel =
            requested === 'gemini-3.5-flash-lite'
              ? 'gemini-2.5-flash'
              : 'gemini-3.5-flash-lite';

          const primary = await callAI(prompt, geminiKeys, requested, startKeyIndex, keyIndexMap);

          if (primary?.result) {
            return {
              ...primary,
              model: requested
            };
          }

          const primaryError = String(primary?.error || '');
          const shouldFallback =
            /high demand|temporarily unavailable|timeout|timed out|ECONNRESET|ETIMEDOUT|503|502|504|500/i.test(primaryError) &&
            !/quota|resource_exhausted|rate.?limit|api key|authentication|unauthorized|permission denied/i.test(primaryError);

          if (!shouldFallback) {
            console.warn(`[Gemini model fallback] skipped for non-transient failure: ${primaryError.slice(0, 180)}`);
            return primary;
          }

          console.warn(
            `[Gemini model fallback] ${requested} failed transiently; retrying SAME chunk with ${fallbackModel}`
          );

          const fallback = await callAI(prompt, geminiKeys, fallbackModel, startKeyIndex, keyIndexMap);

          if (fallback?.result) {
            return {
              ...fallback,
              model: fallbackModel
            };
          }

          return {
            result: '',
            error: fallback?.error || primary?.error || 'Gemini translation failed on both models',
            model: fallbackModel
          };
        }

        function stripMarkdownCodeFence(value) {
          return String(value || '')
            .replace(/^```(?:json|text)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        }

        function buildSubtitleContextSample(srt, maxChars = 10000) {
          const text = String(srt || '').replace(/\r/g, '').trim();
          if (!text) return '';

          // Prefer an opening portion because character names/relationships are
          // often established early, while also taking a small tail to catch
          // recurring character names introduced later.
          if (text.length <= maxChars) return text;

          const headSize = Math.floor(maxChars * 0.72);
          const tailSize = maxChars - headSize;
          return (
            text.slice(0, headSize) +
            '\n\n[...đã lược bớt phần giữa của phụ đề...]\n\n' +
            text.slice(-tailSize)
          );
        }

        function parseRelationshipGuide(raw) {
          const cleaned = stripMarkdownCodeFence(raw);
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') {
              return JSON.stringify(parsed, null, 2);
            }
          } catch {}

          return cleaned;
        }

        async function fetchImdbWebContext(imdbId, fallbackName = '') {
          if (!imdbId) return '';
          try {
            const id = String(imdbId).replace(/^imdb:/i, '').trim();
            if (!/^tt\d+$/.test(id)) return '';
            const url = `https://www.imdb.com/title/${id}/`;
            const response = await axios.get(url, {
              timeout: 7000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
              },
              maxContentLength: 4 * 1024 * 1024
            });
            const html = String(response.data || '');
            if (!html) return '';

            const texts = [];
            const metaPatterns = [
              /<meta[^>]+(?:name|property)=['"](?:description|og:description)['"][^>]+content=['"]([^'"]+)['"]/ig,
              /<meta[^>]+content=['"]([^'"]+)['"][^>]+(?:name|property)=['"](?:description|og:description)['"]/ig
            ];
            for (const re of metaPatterns) {
              let m;
              while ((m = re.exec(html)) !== null) texts.push(m[1]);
            }

            // IMDb embeds structured JSON containing title/plot data on many title pages.
            // Chỉ giữ dữ liệu thuộc nội dung/tên phim; KHÔNG lấy diễn viên, đạo diễn hoặc ê-kíp.
            const jsonLdRe = /<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/ig;
            let jm;
            while ((jm = jsonLdRe.exec(html)) !== null) {
              try {
                const data = JSON.parse(jm[1].trim());
                const rows = Array.isArray(data) ? data : [data];
                for (const row of rows) {
                  if (!row || typeof row !== 'object') continue;
                  if (row.description) texts.push(row.description);
                  if (row.name) texts.push(`Tên: ${row.name}`);
                }
              } catch {}
            }

            // Keep a small text window around IMDb's plot/summary labels when present.
            const plain = html
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&quot;/gi, '"')
              .replace(/&#39;|&apos;/gi, "'")
              .replace(/\s+/g, ' ')
              .trim();
            const needles = ['Plot Summary', 'Plot', 'Storyline', 'Synopsis'];
            for (const needle of needles) {
              const at = plain.toLowerCase().indexOf(needle.toLowerCase());
              if (at >= 0) {
                texts.push(plain.slice(at, at + 5000));
                break;
              }
            }

            const unique = [...new Set(texts.map(x => String(x).trim()).filter(Boolean))];
            if (!unique.length) return '';
            return `IMDb (web, ${id}):\\n${unique.join('\\n').slice(0, 9000)}`;
          } catch (err) {
            console.warn('[IMDb web context]', err.message);
            return '';
          }
        }

        async function fetchWikipediaContext(title, year = '') {
          const name = String(title || '').trim();
          if (!name) return '';
          try {
            const searchUrl = 'https://en.wikipedia.org/w/rest.php/v1/search/page';
            const searchRes = await axios.get(searchUrl, {
              timeout: 7000,
              params: { q: name, limit: 5 },
              headers: { 'User-Agent': 'Gemini-AI-Subtitle-Pro/3.9 (subtitle localization)' }
            });
            const pages = Array.isArray(searchRes.data?.pages) ? searchRes.data.pages : [];
            if (!pages.length) return '';

            const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            const ranked = pages.slice().sort((a, b) => {
              const score = p => {
                const t = String(p?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                let n = t === normalized ? 100 : 0;
                if (year && t.includes(String(year))) n += 5;
                if (t.includes(normalized) || normalized.includes(t)) n += 20;
                return n;
              };
              return score(b) - score(a);
            });
            const pageTitle = ranked[0]?.title;
            if (!pageTitle) return '';

            const htmlUrl = `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(pageTitle)}/html`;
            const pageRes = await axios.get(htmlUrl, {
              timeout: 8000,
              headers: { 'User-Agent': 'Gemini-AI-Subtitle-Pro/3.9 (subtitle localization)' },
              responseType: 'text'
            });
            let html = String(pageRes.data || '');
            if (!html) return '';

            // Remove navigation/reference-heavy elements, then retain readable article text.
            html = html
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<table[\s\S]*?<\/table>/gi, ' ')
              .replace(/<sup[\s\S]*?<\/sup>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&quot;/gi, '"')
              .replace(/&#39;|&apos;/gi, "'")
              .replace(/\s+/g, ' ')
              .trim();

            if (!html) return '';
            return `Wikipedia (English): ${pageTitle}\n${html.slice(0, 10000)}`;
          } catch (err) {
            console.warn('[Wikipedia context]', err.message);
            return '';
          }
        }

        
    // v3.9.80 — English SDH evidence for Character Guide ONLY.
    // This never modifies originalSrt or translation/repair cues.
    function buildSdhGuideEvidence(sdhSrt,maxChars=9000){
      const cues=parseSrtCues(String(sdhSrt||'')),rows=[]; let used=0;
      const sound=/\b(music|door|phone|ring|laugh|sigh|gasp|breath|cry|applause|footstep|gunshot|thunder|whisper|shout|scream|groan|grunt|alarm|knock)\w*\b/i;
      for(const cue of cues){
        const text=String(cue?.text||cue?.body||'').replace(/\s+/g,' ').trim(); if(!text)continue;
        let row=''; const b=text.match(/^\[([^\]]{1,50})\]\s*(.*)$/),c=text.match(/^([A-Z][A-Z0-9 .'\-]{1,40}):\s*(.+)$/);
        if(b){const label=b[1].trim(),rest=String(b[2]||'').trim(); if(sound.test(label))row=`[SDH CONTEXT] ${label}`; else if(rest)row=`[SPEAKER TAG] ${label}: ${rest}`;}
        else if(c)row=`[SPEAKER TAG] ${c[1].trim()}: ${c[2].trim()}`;
        else if(/^[♪♫]|[♪♫]$/.test(text))row=`[SDH CONTEXT] ${text}`;
        if(!row||used+row.length+1>maxChars)continue; rows.push(row); used+=row.length+1;
      }
      return rows.join('\n');
    }
    async function fetchOpenSubtitlesSdhGuideSrt({imdbId,type,season,episode,config}){
      if(!imdbId||!String(imdbId).startsWith('tt'))return '';
      const apiKeyOS=String(config?.opensubtitlesKey||'2015').trim();
      const params={imdb_id:String(imdbId).replace(/^tt/,''),languages:'en',hearing_impaired:'include'};
      if(type==='series'&&season&&episode){params.season_number=Number(season);params.episode_number=Number(episode);}
      const r=await axios.get('https://api.opensubtitles.com/api/v1/subtitles',{params,headers:{'Api-Key':apiKeyOS,...API_HEADERS},timeout:7000});
      const candidates=[];
      for(const item of (Array.isArray(r.data?.data)?r.data.data:[]).slice(0,30)){
        const a=item?.attributes||{},f=(a.files||[]).find(x=>x?.file_id)||a.files?.[0]; if(!f?.file_id)continue;
        const release=subtitleName({releaseName:a.releaseName,release_name:a.release_name,release:a.release,fileName:f.file_name,name:a.name},'');
        let score=a.hearing_impaired===true?100:0;
        if(/\bSDH\b/i.test(release))score+=80;
        if(/hearing[\s._-]*impaired/i.test(release))score+=70;
        if(/(^|[\s._-])HI([\s._-]|$)/i.test(release))score+=45;
        if(/(^|[\s._-])CC([\s._-]|$)/i.test(release))score+=25;
        if(score>0)candidates.push({fileId:f.file_id,release,score});
      }
      candidates.sort((a,b)=>b.score-a.score); const best=candidates[0]; if(!best)return '';
      const d=await axios.post('https://api.opensubtitles.com/api/v1/download',{file_id:String(best.fileId)},{headers:{'Api-Key':apiKeyOS,...API_HEADERS,'Content-Type':'application/json'},timeout:10000,validateStatus:s=>s>=200&&s<300});
      if(!d.data?.link)return '';
      const srt=await fetchSubtitleText(d.data.link,SUBTITLE_BROWSER_HEADERS,25000,1);
      console.log(`🦻 [SDH Guide] selected "${best.release||best.fileId}" | ${String(srt).length.toLocaleString()} chars`);
      return srt;
    }
    async function buildCharacterRelationshipGuide({
          movieContext,
          subtitleSample, sdhEvidence = '',
          geminiKeys,
          model
        }) {
          // v3.9.59: compact seven-layer Character/Relationship Guide.
          // Generated once per episode/job, then reused by every translation chunk.
          const prompt = `
        Bạn là chuyên gia bản địa hóa phụ đề phim Việt Nam.
        TẠO GUIDE 7 LỚP CỰC GỌN cho CHÍNH PHIM/TẬP này. Chỉ ghi thông tin thực sự hữu ích cho việc dịch.
        Không giải thích ngoài JSON. Không suy đoán. Nếu không có bằng chứng thì dùng [] hoặc "".

        GIỮ NGUYÊN 7 LỚP:
        1) characters — tên/alias, giới tính, nhóm tuổi, vai trò, voice.
        2) relationships — quan hệ từng cặp nhân vật.
        3) pronouns — xưng hô HAI CHIỀU, tách SELF và ADDRESS.
        4) changes — thay đổi quan hệ/xưng hô chỉ trong tập này.
        5) voice — phong cách nói ngắn gọn.
        6) terms — tên riêng/địa danh/tổ chức/thực thể/vật phẩm/phép thuật/thuật ngữ.
        7) summary — series 1 câu + episode 1–2 câu từ bằng chứng.

        GIỚI TÍNH / TUỔI / VAI VẾ:
        - Chỉ dùng bằng chứng trong movieContext và subtitleSample của chính phim/tập.
        - Không đoán giới tính chỉ từ tên. Dùng đại từ tiếng Anh, cách gọi, mô tả nhân vật, quan hệ, chức danh và lời thoại khi có bằng chứng.
        - Không bịa tuổi chính xác. Nếu chỉ biết tương đối, dùng age_group và relative_age.
        - age_group: child|teen|young_adult|adult|middle_aged|elderly|unknown.
        - Chọn xưng hô theo: kinship/quan hệ gia đình > hierarchy/vai vế > relative_age > gender > mức thân mật/register.
        - Quan hệ rõ như grandfather/granddaughter, grandmother/grandson, parent/child, uncle/niece, aunt/nephew có ưu tiên cao.
        - Không mặc định nam+nữ = anh/em. Không mặc định người lớn tuổi = ông/bà nếu thiếu bằng chứng.
        - Khi evidence cho thấy chênh lệch tuổi/vai vế rõ, dùng hệ phù hợp như ông/cháu, bà/cháu, bác/cháu, chú/cháu, cô/cháu thay vì tự động anh/em hoặc cậu/tớ.

        XƯNG HÔ HAI CHIỀU:
        - SELF = cách NGƯỜI NÓI tự xưng; ADDRESS = cách NGƯỜI NÓI gọi NGƯỜI NGHE.
        - Với quan hệ A→B: khi A là speaker, I/me/my/mine của A phải dùng SELF trong a_to_b; you/your/yours chỉ B phải dùng ADDRESS trong a_to_b.
        - Với quan hệ B→A: khi B là speaker, I/me/my/mine của B phải dùng SELF trong b_to_a; you/your/yours chỉ A phải dùng ADDRESS trong b_to_a.
        - Tuyệt đối không lấy ADDRESS để dịch I/me/my/mine và không lấy SELF để dịch you/your/yours.
        - Không đảo SELF/ADDRESS. A→B và B→A là hai hướng độc lập.
        - Nếu cùng một nhân vật nói với người nghe khác nhau, SELF/ADDRESS có thể khác theo từng cặp quan hệ; không áp một cặp đại từ toàn cục cho nhân vật.
        - Khi evidence đủ mạnh, khóa cặp xưng hô và giữ nhất quán.
        - DIALOGUE PAIR LOCK: với mỗi cặp nhân vật có đủ evidence, ghi rõ khóa hai chiều A→B và B→A theo dạng speaker, listener, SELF, ADDRESS; đây là khóa theo HƯỚNG, không phải đại từ toàn cục của nhân vật.
        - CONTINUITY EVIDENCE: nếu nhiều cue liên tiếp thuộc cùng một lượt/hội thoại và không có bằng chứng đổi người nghe, coi speaker→listener hiện tại tiếp tục cho đến khi có evidence rõ về đổi speaker/listener, chuyển cảnh hoặc chuyển đối tượng giao tiếp.
        - Không tạo khóa mới chỉ từ một đại từ mơ hồ. Ưu tiên SDH speaker labels, tên được gọi trực tiếp, quan hệ/kinship/hierarchy, lượt đáp qua lại và ngữ cảnh lân cận.
        - GENDER–PRONOUN LOCK: nếu Character Guide đã xác định gender của LISTENER/đối tượng là female hoặc male, mọi ADDRESS/danh xưng có giới tính phải tương thích với gender của chính LISTENER/đối tượng đó; KHÔNG suy theo gender của SPEAKER.
        - Với female đã xác định: KHÔNG gọi bằng “anh”, “ông”, “chú”, “cậu bé” hoặc danh xưng nam tương đương; với male đã xác định: KHÔNG gọi bằng “chị”, “cô”, “bà”, “cô bé” hoặc danh xưng nữ tương đương, TRỪ khi source/ngữ cảnh của tập có bằng chứng rõ ràng đó là cách gọi cố ý/đặc biệt.
        - Trước khi xuất mỗi cue có đại từ/danh xưng hướng tới người nghe, tự kiểm tra: SPEAKER → LISTENER → locked ADDRESS → LISTENER.gender. Nếu ADDRESS mâu thuẫn gender đã xác định, sửa ADDRESS trước khi xuất cue; không được đổi SELF/ADDRESS đã khóa chỉ để câu nghe tự nhiên hơn.
        - CẢM XÚC ĐƠN THUẦN KHÔNG ĐƯỢC PHÁ KHÓA XƯNG HÔ: giận dữ, phẫn nộ, buồn, sợ, hoảng loạn, ghen, căng thẳng, mỉa mai, đe dọa hoặc xúc động chỉ làm thay đổi sắc thái/cách diễn đạt, không tự động đổi SELF/ADDRESS.
        - Chỉ đổi SELF/ADDRESS khi chính lời thoại/ngữ cảnh của tập có bằng chứng rõ rằng speaker/listener đã thay đổi, quan hệ/vai vế giao tiếp thực sự thay đổi, hoặc nhân vật CỐ Ý chuyển register/cách xưng hô để tạo khoảng cách, xúc phạm, trang trọng hóa hay đánh dấu một bước ngoặt quan hệ.
        - Nếu không có bằng chứng rõ cho việc chuyển register/xưng hô, tiếp tục dùng chính xác cặp SELF/ADDRESS đã khóa ở cue trước cho cùng speaker→listener.

        PROTECTED NAMES / TERMS:
        - Nhận diện tên nhân vật, alias, địa danh, tổ chức, sinh vật/thực thể, vật phẩm, phép thuật và thuật ngữ hư cấu.
        - Tên riêng cần giữ nguyên: source=target giống hệt và translate=false.
        - Ví dụ nếu Malivore là tên riêng/thực thể: source="Malivore", target="Malivore", translate=false.
        - Không dịch nghĩa/Việt hóa/diễn giải protected name.
        - Không khóa từ chỉ vì viết hoa đầu câu; phải có bằng chứng đó là tên/thuật ngữ riêng.

        JSON BẮT BUỘC:
        {
          "characters":[{"name":"","aliases":[],"presence":"appears|mentioned","gender":"male|female|unknown","age_group":"child|teen|young_adult|adult|middle_aged|elderly|unknown","role":"","voice":""}],
          "relationships":[{"a":"","b":"","relation":"","status":"","a_gender":"male|female|unknown","b_gender":"male|female|unknown","relative_age":"a_much_older|a_older|similar|b_older|b_much_older|unknown","kinship":"","hierarchy":"","a_to_b":{"self":"","address":""},"b_to_a":{"self":"","address":""},"pronoun_reason":"","confidence":"high|medium|low"}],
          "changes":[{"a":"","b":"","event":"","from":"","to":"","pronoun_effect":""}],
          "terms":[{"source":"","target":"","type":"proper_name|character|place|organization|creature|artifact|spell|fictional_term|translatable_term","translate":true}],
          "summary":{"series":"","episode":""},
          "global_pronouns":""
        }

        MOVIE/EPISODE CONTEXT:
        ${movieContext || 'Không có metadata.'}

        SUBTITLE SAMPLE:
        ${subtitleSample || 'Không có sample.'}

        SDH SPEAKER/CONTEXT EVIDENCE — CHỈ DÙNG LÀM BẰNG CHỨNG CHO GUIDE:
    ${sdhEvidence || 'Không có SDH evidence.'}
    - [SPEAKER TAG] giúp xác định người nói/người nghe.
    - [SDH CONTEXT] là âm thanh/hành động, KHÔNG phải tên nhân vật.
    - Không bịa gender/age/kinship chỉ từ tag SDH.
    - Nếu SDH mâu thuẫn rõ với nội dung tập, ưu tiên nội dung tập.

    Mục tiêu khoảng 1800–3200 ký tự JSON. Ưu tiên bằng chứng chắc chắn và nhất quán hơn việc điền đủ trường.
        `;

          const guideRes = await callAI(prompt, geminiKeys, model);
          if (!guideRes.result) return '';
          return parseRelationshipGuide(guideRes.result);
        }

        function itemIdSafe(value) {
          return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-80) || Math.random().toString(36).slice(2);
        }

        async function handleSubtitles(req, res, encodedConfig) {
          const config = parseConfig(encodedConfig);
          const { type, id } = req.params;
          const parts = id.split(':');
          const imdbId = parts[0];
          const season = parts[1] ? parseInt(parts[1], 10) : null;
          const episode = parts[2] ? parseInt(parts[2], 10) : null;
          const hostUrl = makeHostUrl(req);
          const modelToUse = config.model || 'gemini-3.5-flash-lite';

          // Fresh token for the currently requested episode; old episode URLs become inert.
          const activationToken = createSubtitleActivation(imdbId, type, season, episode);

          // SAME-TRACK MODE:
          // Keep one stable Gemini subtitle URL for the lifetime of this subtitle track.
          // The click request returns one temporary status SRT and starts the background job.
          // After Gemini finishes, a later request to THIS SAME URL returns the cached
          // Vietnamese SRT. Do not use Date.now() here: regenerating the URL on every
          // /subtitles request creates a new client-side resource identity.
          //
          // Bump this constant only when intentionally invalidating old client-side
          // subtitle URLs after a future protocol/response change.
          const aiUrlVersion = '3.9.45';

          let nativeVietSubtitles = [];
          let englishOriginalSubtitles = [];
          let englishSubtitlesForAI = [];

          // ============================================================
          // 1/2/3. QUÉT 3 NGUỒN SONG SONG
          // OpenSubtitles, SubDL và SubSource được chạy đồng thời.
          // Mỗi nguồn tự bắt lỗi riêng để một nguồn lỗi không chặn 2 nguồn còn lại.
          // ============================================================

          const fetchOpenSubtitles = async () => {
            const native = [];
            const ai = [];
            try {
              const apiKeyOS = String(config.opensubtitlesKey || '2015').trim();
              const baseParams = {};
              if (imdbId.startsWith('tt')) baseParams.imdb_id = imdbId.replace(/^tt/, '');
              if (type === 'series' && season !== null && episode !== null) {
                baseParams.season_number = season;
                baseParams.episode_number = episode;
              }

              const searchOS = async languages => {
                const r = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
                  params: { ...baseParams, languages },
                  headers: { 'Api-Key': apiKeyOS, ...API_HEADERS },
                  timeout: 7000
                });
                return Array.isArray(r.data?.data) ? r.data.data : [];
              };

              const [osViResult, osEnResult] = await Promise.allSettled([
                searchOS('vi'),
                searchOS('en')
              ]);
              const osVi = osViResult.status === 'fulfilled' ? osViResult.value : [];
              const osEn = osEnResult.status === 'fulfilled' ? osEnResult.value : [];
              const osSelected = [
                ...osVi.filter(item => isVietnamese(item.attributes?.language || '')).slice(0, 6),
                ...osEn.filter(item => isEnglish(item.attributes?.language || '')).slice(0, 6)
              ];

              const osMapped = await Promise.allSettled(osSelected.map(async item => {
                const file = (item.attributes?.files || []).find(f => f?.file_id) || item.attributes?.files?.[0];
                const lang = item.attributes?.language || '';
                if (!file?.file_id) return null;

                const releaseName = subtitleName(
                  {
                    releaseName: item.attributes?.releaseName,
                    release_name: item.attributes?.release_name,
                    release: item.attributes?.release,
                    fileName: file.file_name,
                    name: item.attributes?.name
                  },
                  'OpenSubtitles Sub'
                );
                const pickerId = subtitlePickerId(releaseName, `os-${item.id}`, season, episode);
                const isVi = isVietnamese(lang);

                // IMPORTANT: defer the authenticated OpenSubtitles /download call
                // until the user actually opens the subtitle. Doing it here makes
                // /subtitles slow and can cause the entire Stremio request to 502.
                const sourceUrl =
                  `${hostUrl}/proxy-os?fileId=${encodeURIComponent(file.file_id)}` +
                  `&config=${encodeURIComponent(encodedConfig || '')}`;
                if (isVi) {
                  return {
                    id: pickerId,
                    url: sourceUrl,
                    lang: 'vie',
                    name: subtitleDisplayName(releaseName, 'vie', 'os')
                  };
                }

                // MANUAL-SELECT ONLY: This entry is intentionally advertised as English.
                // The addon does NOT fetch /translate-sub while building /subtitles.
                // Gemini starts only if the client actually requests this URL.
                // Keep lang='eng' so Vietnamese auto-subtitle preferences do not treat
                // this Gemini trigger as a Vietnamese/native subtitle.
                const aiUrl = `${hostUrl}/translate-sub/g/${encodeURIComponent(activationToken)}?provider=os&fileId=${encodeURIComponent(file.file_id)}&model=${encodeURIComponent(modelToUse)}&config=${encodeURIComponent(encodedConfig || '')}&imdbId=${encodeURIComponent(imdbId)}&type=${type}&season=${season || ''}&episode=${episode || ''}&source=en&target=vi&v=${aiUrlVersion}`;
                return {
                  id: pickerId,
                  url: aiUrl,
                  lang: 'eng',
                  name: subtitleDisplayName(releaseName, 'eng', 'os')
                };
              }));

              for (const r of osMapped) {
                if (r.status !== 'fulfilled' || !r.value) continue;
                if (r.value.lang === 'eng') {
                  englishOriginalSubtitles.push(r.value);
                } else {
                  native.push(r.value);
                }
              }
            } catch (err) {
              console.error('[OpenSubtitles]', err.response?.status || '', err.response?.data || err.message);
            }
            return { native, ai };
          };

          const fetchSubDL = async () => {
            const native = [];
            const ai = [];
            try {
              if (!imdbId || !config.subdlKey) return { native, ai };

              const apiKeySubDL = config.subdlKey;
              const searchSubDL = async languages => {
                const r = await axios.get('https://api.subdl.com/api/v1/subtitles', {
                  params: {
                    api_key: apiKeySubDL,
                    imdb_id: imdbId,
                    type: type === 'series' ? 'tv' : 'movie',
                    languages,
                    ...(type === 'series' && season !== null ? { season_number: season } : {}),
                    ...(type === 'series' && episode !== null ? { episode_number: episode } : {}),
                    unpack: 1
                  },
                  timeout: 7000
                });
                return Array.isArray(r.data?.subtitles) ? r.data.subtitles : [];
              };

              const [viResult, enResult] = await Promise.allSettled([
                searchSubDL('VI'),
                searchSubDL('EN')
              ]);
              const viPacks = viResult.status === 'fulfilled' ? viResult.value : [];
              const enPacks = enResult.status === 'fulfilled' ? enResult.value : [];

              const flatten = (packs, wantedLang) => {
                const out = [];
                for (const sub of packs) {
                  const files = Array.isArray(sub.unpack_files) && sub.unpack_files.length
                    ? sub.unpack_files
                    : [sub];
                  for (const f of files) {
                    const lang = f.language || sub.language || f.lang || sub.lang || '';
                    if (!((wantedLang === 'vi' && isVietnamese(lang)) || (wantedLang === 'en' && isEnglish(lang)))) continue;
                    const fileUrl = f.url || sub.url;
                    if (!fileUrl) continue;
                    out.push({
                      ...sub,
                      ...f,
                      language: lang,
                      url: fileUrl,
                      release_name: f.release_name || sub.release_name || f.name || sub.name
                    });
                  }
                }
                return out;
              };

              // v3.9.83 CLEAN: SubDL can return a whole-season pack even when
              // episode_number is supplied. Filter EACH unpacked file by requested
              // season/episode before taking the first 6 results.
              const episodeMatchesSubDL = sub => {
                if (type !== 'series' || season === null || episode === null) return true;

                const sVals = [
                  sub?.season, sub?.season_number, sub?.seasonNumber,
                  sub?.attributes?.season, sub?.attributes?.season_number, sub?.attributes?.seasonNumber
                ].map(Number).filter(Number.isFinite);
                const eVals = [
                  sub?.episode, sub?.episode_number, sub?.episodeNumber,
                  sub?.attributes?.episode, sub?.attributes?.episode_number, sub?.attributes?.episodeNumber
                ].map(Number).filter(Number.isFinite);

                if (sVals.some(v => v !== Number(season))) return false;
                if (eVals.some(v => v !== Number(episode))) return false;

                const names = [
                  subtitleName(sub, ''),
                  typeof sub?.release_name === 'string' ? sub.release_name : '',
                  typeof sub?.name === 'string' ? sub.name : '',
                  typeof sub?.file_name === 'string' ? sub.file_name : '',
                  typeof sub?.filename === 'string' ? sub.filename : ''
                ].filter(Boolean).join(' ');

                const matches = [...names.matchAll(/(?:^|[\s._\-\[(])S(\d{1,3})[ ._\-]?E(\d{1,3})(?=$|[\s._\-\])])/gi)];
                if (matches.length === 0) return true;
                return matches.some(m =>
                  Number(m[1]) === Number(season) &&
                  Number(m[2]) === Number(episode)
                );
              };

              const subdlVi = flatten(viPacks, 'vi').filter(episodeMatchesSubDL).slice(0, 6);
              const subdlEn = flatten(enPacks, 'en').filter(episodeMatchesSubDL).slice(0, 6);
              const mapped = [
                ...subdlVi.map(sub => ({ sub, vi: true })),
                ...subdlEn.map(sub => ({ sub, vi: false }))
              ];

              for (const { sub, vi } of mapped) {
                const lang = sub.language || sub.lang || '';
                const rawUrl = sub.url;
                if (!rawUrl) continue;
                const dlUrl = rawUrl.startsWith('http') ? rawUrl : `https://dl.subdl.com${rawUrl}`;
                const releaseName = subtitleName(sub, 'SubDL Sub');
                const idPart = sub.file_n_id || sub.n_id || sub.nId || sub.id || Math.random().toString(36).slice(2);
                const pickerId = subtitlePickerId(releaseName, `subdl-${idPart}`, season, episode);

                const sourceUrl =
                  `${hostUrl}/proxy-subdl?url=${encodeURIComponent(dlUrl)}` +
                  `&config=${encodeURIComponent(encodedConfig || '')}`;
                if (vi && isVietnamese(lang)) {
                  native.push({
                    id: pickerId,
                    url: sourceUrl,
                    lang: 'vie',
                    name: subtitleDisplayName(releaseName, 'vie', 'subdl')
                  });
                } else if (!vi && isEnglish(lang)) {
                  // MANUAL-SELECT ONLY: Selecting this English entry triggers EN -> VI.
                  // Never call this URL from subtitle discovery.
                  const aiUrl = `${hostUrl}/translate-sub/g/${encodeURIComponent(activationToken)}?provider=subdl&sourceUrl=${encodeURIComponent(dlUrl)}&model=${encodeURIComponent(modelToUse)}&config=${encodeURIComponent(encodedConfig || '')}&imdbId=${encodeURIComponent(imdbId)}&type=${type}&season=${season || ''}&episode=${episode || ''}&source=en&target=vi&v=${aiUrlVersion}`;
                  englishOriginalSubtitles.push({
                    id: pickerId,
                    url: aiUrl,
                    lang: 'eng',
                    name: subtitleDisplayName(releaseName, 'eng', 'subdl')
                  });
                }
              }
            } catch (err) {
              console.error('[SubDL]', err.response?.status || '', err.response?.data || err.message);
            }
            return { native, ai };
          };

          const fetchSubSource = async () => {
            const native = [];
            const ai = [];
            try {
              if (!imdbId || !config.subsourceKey) return { native, ai };

              let movieTitle = '';
              try {
                const metaRes = await axios.get(
                  `https://v3-cinemeta.strem.io/meta/${type === 'series' ? 'series' : 'movie'}/${encodeURIComponent(imdbId)}.json`,
                  { timeout: 5000 }
                );
                movieTitle = metaRes.data?.meta?.name || '';
              } catch (err) {
                console.error('[SubSource Cinemeta]', err.message);
              }

              if (!movieTitle) return { native, ai };

              const searchRes = await axios.get(`${SUBSOURCE_API}/movies/search`, {
                params: {
                  searchType: 'text',
                  q: movieTitle,
                  ...(type === 'series' && season !== null ? { season } : {})
                },
                headers: getSubsourceHeaders(config.subsourceKey),
                timeout: 10000
              });

              const searchResults = Array.isArray(searchRes.data?.data) ? searchRes.data.data : [];
              const matchedMovie = searchResults.find(movie =>
                String(movie.imdbId || '').replace(/^tt/i, '') === String(imdbId).replace(/^tt/i, '') &&
                (type !== 'series' || season === null || movie.season == null || Number(movie.season) === season)
              );

              if (!matchedMovie?.movieId) return { native, ai };

              const getSubsourceSubs = async language => {
                const response = await axios.get(`${SUBSOURCE_API}/subtitles`, {
                  params: {
                    movieId: matchedMovie.movieId,
                    language,
                    page: 1,
                    limit: 100,
                    sort: 'rating'
                  },
                  headers: getSubsourceHeaders(config.subsourceKey),
                  timeout: 10000
                });
                return Array.isArray(response.data?.data) ? response.data.data : [];
              };

              // Once the movie is identified, VI/EN subtitle searches are also parallel.
              let [vietnamesePrimary, english] = await Promise.all([
                getSubsourceSubs('vietnamese').catch(() => []),
                getSubsourceSubs('english').catch(() => [])
              ]);

              let vietnameseSubs = vietnamesePrimary
                .filter(sub => isVietnamese(sub.language ?? sub.languageCode ?? sub.language_code ?? sub.lang));
              let englishSubs = english
                .filter(sub => isEnglish(sub.language ?? sub.languageCode ?? sub.language_code ?? sub.lang));

              // v3.9.72 provider fix: if SubSource exposes season/episode metadata,
              // reject records that explicitly belong to another episode. Metadata-less
              // records remain eligible because the matched movie/season already scopes them.
              const episodeMatchesSubSource = sub => {
                if (type !== 'series' || season === null || episode === null) return true;
                const sVals = [sub?.season, sub?.seasonNumber, sub?.season_number,
                  sub?.attributes?.season, sub?.attributes?.seasonNumber, sub?.attributes?.season_number]
                  .map(Number).filter(Number.isFinite);
                const eVals = [sub?.episode, sub?.episodeNumber, sub?.episode_number,
                  sub?.attributes?.episode, sub?.attributes?.episodeNumber, sub?.attributes?.episode_number]
                  .map(Number).filter(Number.isFinite);
                if (sVals.some(v => v !== Number(season))) return false;
                if (eVals.some(v => v !== Number(episode))) return false;
                // v3.9.73 fix: SubSource's releaseName/fileName fields can be an array of
                // objects (one per file in the release), e.g. [{name:"Evil.S04E02..."}, ...].
                // Naively `.join(' ')`-ing the raw fields on such an array produces
                // "[object Object] [object Object]" garbage that never matches the S/E regex,
                // which made this filter silently PASS wrong-episode releases (fail-open).
                // Reuse subtitleName()'s array/object-aware extraction instead, and scan
                // EVERY SxxExx token found (a release can bundle several files/episodes),
                // accepting if any token matches the requested episode.
                const names = [
                  subtitleName(sub, ''),
                  typeof sub?.name === 'string' ? sub.name : '',
                  typeof sub?.title === 'string' ? sub.title : ''
                ].filter(Boolean).join(' ');
                const matches = [];
                const episodePatterns = [
                  /(?:^|[\s._\-\[(])S(\d{1,3})[ ._\-]?E(\d{1,3})(?=$|[\s._\-\])])/gi,
                  /(?:^|[\s._\-\[(])S(\d{1,3})xE?(\d{1,3})(?=$|[\s._\-\])])/gi,
                  /(?:^|[\s._\-\[(])(\d{1,3})x(\d{1,3})(?=$|[\s._\-\])])/gi
                ];
                for (const rx of episodePatterns) {
                  for (const m of names.matchAll(rx)) matches.push(m);
                }
                if (matches.length === 0) return true;
                return matches.some(m => Number(m[1]) === Number(season) && Number(m[2]) === Number(episode));
              };
              vietnameseSubs = vietnameseSubs.filter(episodeMatchesSubSource);
              englishSubs = englishSubs.filter(episodeMatchesSubSource);

              // Keep native Vietnamese AND English separately.
              // English is needed both as the original subtitle and as the source for Gemini AI.
              const selectedSubs = [
                ...vietnameseSubs.slice(0, 6).map(sub => ({ sub, vi: true })),
                ...englishSubs.slice(0, 6).map(sub => ({ sub, vi: false }))
              ];

              for (const item of selectedSubs) {
                const sub = item.sub;
                const isViSelected = item.vi;
                if (!sub.subtitleId) continue;
                const releaseName = subtitleName(
                  sub,
                  sub.productionType || 'SubSource'
                );
                const pickerId = subtitlePickerId(releaseName, `subsource-${sub.subtitleId}`, season, episode);
                const downloadUrl =
                  `${hostUrl}/subsource-sub/${encodeURIComponent(sub.subtitleId)}` +
                  `?config=${encodeURIComponent(encodedConfig || '')}`;
                const subLanguage = sub.language ?? sub.languageCode ?? sub.language_code ?? sub.lang;

                if (isViSelected && isVietnamese(subLanguage)) {
                  native.push({
                    id: pickerId,
                    url: downloadUrl,
                    lang: 'vie',
                    name: subtitleDisplayName(releaseName, 'vie', 'subsource')
                  });
                } else if (!isViSelected && isEnglish(subLanguage)) {
                  const aiUrl =
                    `${hostUrl}/translate-sub/g/${encodeURIComponent(activationToken)}?provider=subsource` +
                    `&subtitleId=${encodeURIComponent(sub.subtitleId)}` +
                    `&model=${encodeURIComponent(modelToUse)}` +
                    `&config=${encodeURIComponent(encodedConfig || '')}` +
                    `&imdbId=${encodeURIComponent(imdbId)}` +
                    `&type=${encodeURIComponent(type)}` +
                    `&season=${season || ''}&episode=${episode || ''}&source=en&target=vi&v=${aiUrlVersion}`;
                  // MANUAL-SELECT ONLY: Selecting this English entry triggers EN -> VI.
                  // Never call this URL from subtitle discovery.
                  englishOriginalSubtitles.push({
                    id: pickerId,
                    url: aiUrl,
                    lang: 'eng',
                    name: subtitleDisplayName(releaseName, 'eng', 'subsource')
                  });
                }
              }
            } catch (err) {
              console.error('[SubSource]', err.response?.status || '', err.response?.data || err.message);
            }
            return { native, ai };
          };

          const [osResult, subdlResult, subsourceResult] = await Promise.allSettled([
            fetchOpenSubtitles(),
            fetchSubDL(),
            fetchSubSource()
          ]);

          for (const result of [osResult, subdlResult, subsourceResult]) {
            if (result.status !== 'fulfilled' || !result.value) continue;
            nativeVietSubtitles.push(...result.value.native);
            // English tracks already point to /translate-sub; no separate AI track is exposed.
          }

          console.log(
            '[Subtitles parallel]',
            `OS=${osResult.status}`,
            `SubDL=${subdlResult.status}`,
            `SubSource=${subsourceResult.status}`,
            `VI=${nativeVietSubtitles.length}`,
            `EN=${englishOriginalSubtitles.length}`,
            `AI=click-English`
          );

          // IMPORTANT: Vietnamese originals stay untouched. English entries themselves
          // point to /translate-sub, so Gemini is called only after the user selects English.
          // Stremio can receive duplicate English entries when multiple provider
          // records point to the same download URL. Keep one AI entry per unique
          // translate URL so the subtitle picker does not show duplicate Gemini items.
          // Deduplicate ONLY the same underlying subtitle from the same provider.
          // Do NOT deduplicate by displayed release name: different providers/files can
          // legitimately use the same release name and must remain selectable.
          const seenSubtitleKeys = new Set();
          const subtitleDedupKey = sub => {
            const url = String(sub?.url || '').trim();
            const lowerUrl = url.toLowerCase();

            if (lowerUrl.includes('/proxy-os?')) {
              try {
                const u = new URL(url);
                const fileId = String(u.searchParams.get('fileId') || '').trim();
                if (fileId) return `os:file:${fileId}`;
              } catch (_) {}
              return `os:url:${url}`;
            }

            if (lowerUrl.includes('/proxy-subdl?')) {
              try {
                const u = new URL(url);
                const raw = u.searchParams.get('url') || '';
                if (raw) return `subdl:url:${raw}`;
              } catch (_) {}
              return `subdl:url:${url}`;
            }

            if (lowerUrl.includes('/subsource-sub/')) {
              try {
                const u = new URL(url);
                const pathMatch = u.pathname.match(/\/subsource-sub\/([^/?]+)/i);
                if (pathMatch?.[1]) return `subsource:id:${decodeURIComponent(pathMatch[1])}`;
              } catch (_) {}
              return `subsource:url:${url}`;
            }

            if (lowerUrl.includes('/translate-sub?')) {
              try {
                const u = new URL(url);
                const provider = String(u.searchParams.get('provider') || '').toLowerCase();
                const fileId = String(u.searchParams.get('fileId') || '').trim();
                const subtitleId = String(u.searchParams.get('subtitleId') || '').trim();
                const sourceUrl = String(u.searchParams.get('sourceUrl') || '').trim();
                if (provider === 'os' && fileId) return `os:file:${fileId}`;
                if (provider === 'subdl' && sourceUrl) return `subdl:url:${sourceUrl}`;
                if (provider === 'subsource' && subtitleId) return `subsource:id:${subtitleId}`;
              } catch (_) {}
            }

            return `url:${url}`;
          };

          // Force subtitle picker order: OpenSubtitles -> SubSource -> SubDL.
          // The provider fetches run in parallel, so Promise.allSettled completion/order
          // must never determine the order shown to Stremio/Nuvio.
          const providerRank = sub => {
            // v3.9.30: `id` is now the release name shown by Nuvio, so provider
            // ordering must be derived from the URL instead of the old id prefix.
            const url = String(sub?.url || '').toLowerCase();
            try {
              const u = new URL(url);
              const provider = String(u.searchParams.get('provider') || '').toLowerCase();
              if (provider === 'os' || provider === 'opensubtitles') return 0;
              if (provider === 'subsource') return 1;
              if (provider === 'subdl') return 2;
            } catch (_) {}
            if (url.includes('/proxy-os?')) return 0;
            if (url.includes('/subsource-sub/')) return 1;
            if (url.includes('/proxy-subdl?')) return 2;
            return 3;
          };

          const subtitles = [...nativeVietSubtitles, ...englishOriginalSubtitles].filter(sub => {
            const key = subtitleDedupKey(sub);
            if (seenSubtitleKeys.has(key)) return false;
            seenSubtitleKeys.add(key);
            return true;
          });

          subtitles.sort((a, b) => providerRank(a) - providerRank(b));

          console.log('[Subtitles order]', subtitles.map(sub => ({
            id: sub?.id || '',
            releaseNameShown: sub?.id || '',
            name: sub?.name || '',
            url: sub?.url || ''
          })));

          res.json({ subtitles });
        }

        app.get('/subsource-sub/:subtitleId', async (req, res) => {
          const { subtitleId } = req.params;
          const config = parseConfig(req.query.config || '');
          const apiKey = String(config.subsourceKey || '').trim();
          console.log('[VI ORIGINAL SubSource]', JSON.stringify({ subtitleId: subtitleId || '', hasKey: !!apiKey }));

          if (!subtitleId) return res.status(400).send('Missing subtitle ID');
          if (!apiKey) return res.status(401).send('Missing SubSource API Key');

          try {
            const text = await fetchSubsourceSubtitleText(subtitleId, apiKey);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.send(text);
          } catch (err) {
            console.error('[VI ORIGINAL SubSource]', err.response?.status || '', err.code || '', err.message);
            res.status(502).send(
              'Không thể tải phụ đề từ SubSource: ' + String(err.message || 'upstream error').slice(0, 180)
            );
          }
        });

        app.get('/proxy-os', async (req, res) => {
          const fileId = String(req.query.fileId || '');
          const directLink = String(req.query.link || '');
          const config = parseConfig(req.query.config || '');
          const apiKeyOS = String(config.opensubtitlesKey || '2015').trim();
          console.log('[VI ORIGINAL OpenSubtitles]', JSON.stringify({ fileId: fileId || '', hasKey: !!config.opensubtitlesKey }));

          if (!fileId && !directLink) {
            return res.status(400).send('Missing OpenSubtitles file ID');
          }

          try {
            let link = directLink;

            // Authenticated download is intentionally deferred until subtitle click.
            if (!link && fileId) {
              const download = await axios.post(
                'https://api.opensubtitles.com/api/v1/download',
                { file_id: fileId },
                {
                  headers: {
                    'Api-Key': apiKeyOS,
                    ...API_HEADERS,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000,
                  validateStatus: status => status >= 200 && status < 300
                }
              );

              link = download.data?.link || '';
              if (!link) {
                throw new Error(`OpenSubtitles /download không trả link (HTTP ${download.status || 'unknown'}).`);
              }
            }

            const subtitleText = await fetchSubtitleText(link, SUBTITLE_BROWSER_HEADERS, 30000, 2);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(subtitleText);
          } catch (err) {
            const status = err.response?.status || '';
            const detail =
              err.response?.data?.message ||
              err.response?.data?.errors?.[0]?.message ||
              err.message ||
              'upstream error';

            console.error('[VI ORIGINAL OpenSubtitles]', status, err.code || '', detail);
            return res.send('1\n00:00:01,000 --> 00:00:10,000\n[OpenSubtitles] Không thể tải phụ đề gốc: ' + String(detail).replace(/\r?\n/g, ' ').slice(0, 180));
          }
        });

        app.get('/proxy-subdl', async (req, res) => {
          const url = String(req.query.url || '');
          const config = parseConfig(req.query.config || '');
          const key = String(config.subdlKey || '').trim();
          console.log('[VI ORIGINAL SubDL]', JSON.stringify({ hasUrl: !!url, hasKey: !!key }));

          if (!url) return res.status(400).send('Missing SubDL URL');
          if (!key) return res.status(401).send('Missing SubDL API Key');

          try {
            const subtitleText = await fetchSubtitleText(url, {
              ...SUBTITLE_BROWSER_HEADERS,
              'X-API-Key': key,
              'Authorization': `Bearer ${key}`
            }, 30000, 2);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(subtitleText);
          } catch (err) {
            console.error('[VI ORIGINAL SubDL]', err.response?.status || '', err.code || '', err.message);
            return res.send('1\n00:00:01,000 --> 00:00:10,000\n[SubDL] Không thể tải phụ đề gốc: ' + String(err.message || 'upstream error').replace(/\r?\n/g, ' ').slice(0, 180));
          }
        });

        app.get('/proxy-sub', async (req, res) => {
          const { url } = req.query;
          if (!url) return res.status(400).send('Missing URL');
          try {
            const text = await fetchSubtitleText(url, SUBTITLE_BROWSER_HEADERS, 30000);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.send(text);
          } catch (err) {
            console.error('[proxy-sub]', err.response?.status || '', err.code || '', err.message);
            res.send('1\n00:00:01,000 --> 00:00:10,000\n[Proxy] Không thể tải phụ đề gốc: ' + String(err.message || 'upstream error').replace(/\r?\n/g, ' ').slice(0, 180));
          }
        });

        app.get('/ai-test-all', async (req, res) => {
          const config = parseConfig(req.query.config || '');
          const geminiKeys = (config.geminiKeys && config.geminiKeys.length > 0)
            ? config.geminiKeys
            : [process.env.GEMINI_API_KEY].filter(Boolean);
          const requestedModel = req.query.model || config.model || 'gemini-3.5-flash-lite';

          if (!geminiKeys.length) {
            return res.json({ ok: false, error: 'Chưa có Gemini API Key', keys: [] });
          }

          const results = await Promise.all(geminiKeys.slice(0, 3).map(async (key, index) => {
            const r = await callAIWithKey(
              'Trả lời đúng một câu: Gemini worker hoạt động bình thường.',
              key,
              requestedModel,
              [index]
            );
            return {
              worker: index + 1,
              keyHint: `${String(key).slice(0, 6)}...${String(key).slice(-4)}`,
              ok: !!r.result,
              modelUsed: r.model || null,
              error: r.error || null
            };
          }));

          res.json({ ok: results.every(r => r.ok), modelRequested: requestedModel, workers: results });
        });

        app.get('/ai-test', async (req, res) => {
          const config = parseConfig(req.query.config || '');
          const geminiKeys = (config.geminiKeys && config.geminiKeys.length > 0)
            ? config.geminiKeys
            : [process.env.GEMINI_API_KEY].filter(Boolean);

          const requestedModel = req.query.model || config.model || 'gemini-3.5-flash-lite';

          if (!geminiKeys.length) {
            return res.json({
              ok: false,
              error: 'Chưa có Gemini API Key',
              model: requestedModel,
              configReceived: !!req.query.config
            });
          }

          const result = await callAI(
            'Trả lời đúng một câu: Gemini hoạt động bình thường.',
            geminiKeys,
            requestedModel
          );

          res.json({
            ok: !!result.result,
            modelRequested: requestedModel,
            modelUsed: result.model || null,
            result: result.result || '',
            error: result.error || null
          });
        });

        // In-memory translation cache. This is especially useful on Android/Android TV,
        // where a slow subtitle URL may be requested more than once. Completed results
        // are reused immediately on later subtitle requests.
        // v3.9.48: cache the character/relationship guide per EPISODE + model.
        // Không dùng guide của tập khác vì quan hệ/xưng hô có thể thay đổi theo tập.
        const characterGuideCache = new Map();
        const CHARACTER_GUIDE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

        const translatedSubtitleCache = new Map();
        const TRANSLATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
        const TRANSLATION_CACHE_MAX = 40;
        const translationInFlight = new Map();

        // v3.9.48: stale subtitle URL gate. Nuvio can keep an old subtitle URL from a
        // previous episode and request it again when a new episode opens. Old URLs must
        // not start Gemini or return the temporary status subtitle.
        const subtitleActivation = new Map();
        const SUBTITLE_ACTIVATION_TTL_MS = 15 * 60 * 1000;

        function makeActivationShowKey(imdbId, type) {
          return `${String(imdbId || '').trim().toLowerCase()}|${String(type || '').trim().toLowerCase()}`;
        }
        function makeActivationEpisodeKey(season, episode) {
          const s = season === '' || season == null ? '-' : String(Number(season));
          const e = episode === '' || episode == null ? '-' : String(Number(episode));
          return `${s}|${e}`;
        }
        function createSubtitleActivation(imdbId, type, season, episode) {
          const showKey = makeActivationShowKey(imdbId, type);
          const createdAt = Date.now();
          const payload = {
            v: 1,
            i: String(imdbId || '').trim().toLowerCase(),
            y: String(type || '').trim().toLowerCase(),
            e: makeActivationEpisodeKey(season, episode),
            t: createdAt,
            n: Math.random().toString(36).slice(2, 12)
          };

          // The token carries its own episode identity so Vercel can validate it
          // across different serverless/Fluid Compute instances. The in-memory map
          // is still kept for Render and for the original same-process fast path.
          const token = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
          subtitleActivation.set(showKey, {
            token,
            episodeKey: payload.e,
            createdAt
          });

          const now = Date.now();
          for (const [key, entry] of subtitleActivation) {
            if (!entry || now - entry.createdAt > SUBTITLE_ACTIVATION_TTL_MS) subtitleActivation.delete(key);
          }
          return token;
        }

        function isSubtitleActivationValid(imdbId, type, season, episode, token) {
          if (!token) return false;

          const showKey = makeActivationShowKey(imdbId, type);
          const episodeKey = makeActivationEpisodeKey(season, episode);
          const entry = subtitleActivation.get(showKey);

          // Original same-process validation remains the preferred path.
          if (entry && Date.now() - entry.createdAt <= SUBTITLE_ACTIVATION_TTL_MS) {
            if (entry.token === String(token) && entry.episodeKey === episodeKey) return true;
            // A newer /subtitles request for this show has armed a different episode
            // on this process. Reject the retained old URL before cache lookup.
            return false;
          }

          // Vercel instances do not share process memory. A token created by
          // /subtitles can therefore arrive at another instance with no Map entry.
          // Validate the self-contained token identity itself on EVERY instance instead
          // of depending on process.env.VERCEL or the local activation Map. This removes
          // the false first-click STALE/UNARMED block while retaining episode/TTL checks.
          try {
              const payload = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
              if (!payload || payload.v !== 1) return false;
              if (!payload.t || Date.now() - Number(payload.t) > SUBTITLE_ACTIVATION_TTL_MS) return false;
              if (String(payload.i || '') !== String(imdbId || '').trim().toLowerCase()) return false;
              if (String(payload.y || '') !== String(type || '').trim().toLowerCase()) return false;
              if (String(payload.e || '') !== episodeKey) return false;
              return true;
            } catch (_) {
              return false;
            }

          return false;
        }

        function makeTranslationCacheKey({
          url,
          provider,
          fileId,
          sourceUrl,
          subtitleId,
          model,
          imdbId,
          type,
          season,
          episode
        }) {
          // Use the subtitle's logical identity first. Stremio/Android can request
          // the same subtitle more than once and the provider URL may vary between
          // requests, so URL-only keys can fail to deduplicate those requests.
          const logicalSource =
            provider === 'os'
              ? `os:file:${fileId || ''}`
              : provider === 'subdl'
                ? `subdl:${sourceUrl || url || ''}`
                : provider === 'subsource'
                  ? `subsource:${subtitleId || ''}`
                  : `url:${url || sourceUrl || ''}`;

          const normalizedImdb = String(imdbId || '').trim().toLowerCase();
          const normalizedType = String(type || '').trim().toLowerCase();
          const normalizedSeason = season === '' || season == null ? '-' : String(Number(season));
          const normalizedEpisode = episode === '' || episode == null ? '-' : String(Number(episode));
          const normalizedModel = String(model || '').trim();

          return [
            'v3.9.63',
            logicalSource,
            normalizedModel,
            normalizedImdb,
            normalizedType,
            normalizedSeason,
            normalizedEpisode
          ].join('|');
        }

        function getCachedTranslation(key) {
          const hit = translatedSubtitleCache.get(key);
          if (!hit) return null;
          if (Date.now() - hit.createdAt > TRANSLATION_CACHE_TTL_MS) {
            translatedSubtitleCache.delete(key);
            return null;
          }
          return hit.srt;
        }

        function setCachedTranslation(key, srt) {
          translatedSubtitleCache.set(key, { createdAt: Date.now(), srt });
          while (translatedSubtitleCache.size > TRANSLATION_CACHE_MAX) {
            const oldestKey = translatedSubtitleCache.keys().next().value;
            if (oldestKey === undefined) break;
            translatedSubtitleCache.delete(oldestKey);
          }
        }


        function formatEta(seconds) {
          const s = Math.max(0, Math.round(Number(seconds) || 0));
          if (s < 60) return `${s} giây`;
          const m = Math.floor(s / 60);
          const sec = s % 60;
          if (m < 60) return sec ? `${m} phút ${sec} giây` : `${m} phút`;
          const h = Math.floor(m / 60);
          const mm = m % 60;
          return mm ? `${h} giờ ${mm} phút` : `${h} giờ`;
        }

        function makeStatusSrt(message = '', durationSeconds = 30) {
          // v3.9.33: status is created ONLY after /translate-sub is requested
          // (i.e. after the user selects the English/Gemini subtitle). It is never
          // generated during /subtitles discovery. The duration is supplied by the
          // translation request flow, not by a timer running in the client.
          const safeDuration = Math.max(5, Math.min(3600, Number(durationSeconds) || 30));
          const endMs = Math.round(safeDuration * 1000);
          const h = String(Math.floor(endMs / 3600000)).padStart(2, '0');
          const m = String(Math.floor((endMs % 3600000) / 60000)).padStart(2, '0');
          const sec = String(Math.floor((endMs % 60000) / 1000)).padStart(2, '0');
          const ms = String(endMs % 1000).padStart(3, '0');
          return `1\n00:00:00,000 --> ${h}:${m}:${sec},${ms}\n${String(message || '').trim()}`;
        }

        function shiftAndAppendSrt(baseNumber, srt) {
          const clean = String(srt || '').trim();
          if (!clean) return '';
          let n = baseNumber;
          return clean
            .split(/\r?\n\s*\r?\n/)
            .map(block => {
              const lines = block.split(/\r?\n/);
              if (!lines.length) return '';
              const first = lines[0].trim();
              if (/^\d+$/.test(first)) {
                lines[0] = String(n++);
              } else {
                lines.unshift(String(n++));
              }
              return lines.join('\n');
            })
            .filter(Boolean)
            .join('\n\n');
        }

        function writeLiveStatus(res, state, force = false) {
          if (!state || !res || res.writableEnded) return;
          const now = Date.now();
          if (!force && state.lastWrite && now - state.lastWrite < 350) return;
          state.lastWrite = now;

          const elapsed = (now - state.startedAt) / 1000;
          const done = Math.max(0, state.done || 0);
          const total = Math.max(1, state.total || 1);
          const percent = Math.min(100, Math.round((done / total) * 100));
          let eta = state.etaSeconds;
          if (done > 0 && elapsed > 0) {
            const avg = elapsed / done;
            eta = Math.max(0, Math.round(avg * (total - done)));
          }

          let text;
          if (state.error) {
            text = `❌ Gemini AI: ${state.error}`;
          } else if (state.finished) {
            text = '✅ Gemini AI: Dịch phụ đề hoàn tất.';
          } else if (state.fallback) {
            text = `🔁 Gemini AI: ${state.fallback}`;
          } else if (done > 0) {
            text = `🟡 Gemini AI đang dịch... ${done}/${total} (${percent}%)\n⏱️ Còn khoảng: ${formatEta(eta)}`;
          } else {
            text = `🟡 Gemini AI đang dịch phụ đề...\n📦 ${total} đoạn cần dịch\n⏱️ Dự kiến: khoảng ${formatEta(eta)}\n🤖 Model: ${state.model}`;
          }

          // This is deliberately valid SRT. Stremio may buffer the HTTP response,
          // so live updates are client-dependent; when streaming is supported they
          // appear as temporary subtitle/status cues instead of a native toast.
          const cueStart = Math.max(0, (state.statusCueIndex || 0) * 2500);
          const cueEnd = cueStart + 2200;
          state.statusCueIndex = (state.statusCueIndex || 0) + 1;
          res.write(makeStatusSrt(state.statusNumber++, cueStart, cueEnd, text));
        }

        // Gate compatibility: Nuvio/OkHttp may strip the `gate` query parameter while
        // preserving the URL path. Put the activation token in the path for newly
        // advertised AI subtitle URLs, while still accepting the old query form.
        app.get(['/translate-sub', '/translate-sub/g/:gate'], async (req, res) => {
          const { url, provider, fileId, sourceUrl, subtitleId, model, config: configQuery, imdbId, type, season, episode, source, target, gate: gateQuery } = req.query;
          const gate = req.params.gate || gateQuery;
          // v3.9.48 diagnostic: capture the client request fingerprint so we can verify
          // whether Nuvio sends different headers for preload vs manual subtitle select.
          // Do NOT log query strings/config/API keys.
          console.log('[translate-sub headers]', JSON.stringify({
            ua: req.get('user-agent') || '',
            referer: req.get('referer') || '',
            accept: req.get('accept') || '',
            range: req.get('range') || '',
            xrw: req.get('x-requested-with') || '',
            fetchDest: req.get('sec-fetch-dest') || '',
            fetchMode: req.get('sec-fetch-mode') || '',
            fetchSite: req.get('sec-fetch-site') || '',
            cacheControl: req.get('cache-control') || ''
          }));
          // v3.9.33 MANUAL-SELECT GATE:
          // /translate-sub is intentionally a separate resource URL. The subtitle
          // discovery route only advertises this URL; it never downloads the source
          // subtitle and never calls Gemini. If a client chooses to auto-select a
          // subtitle, the HTTP request is indistinguishable from a manual selection
          // at server level. Therefore the addon cannot manufacture a "click" event;
          // the reliable server-side rule is: translation starts ONLY when this
          // endpoint is actually requested, and the AI track stays lang='eng' so it
          // is not presented as a Vietnamese subtitle for automatic language choice.


          // v3.9.33: MANUAL-SELECTION ONLY + SAME-TRACK / TWO-REQUEST FLOW:
          // Request #1 occurs only after the user selects the Gemini subtitle track.
          // Return a temporary status SRT once and start translation in the background.
          // A later request to the SAME track URL -> return the cached final Vietnamese SRT.
          // No second Gemini track is created and no subtitle `lang` declaration is changed.
          // Do not stream progress through res.write(); Stremio may cache/buffer the first SRT.
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.setHeader('X-Accel-Buffering', 'no');

          if (!url && !provider) {
            return res.send('1\n00:00:01,000 --> 00:00:05,000\n[LỖI]: Thiếu nguồn phụ đề tiếng Anh.');
          }

          if (source && String(source).toLowerCase() !== 'en') {
            return res.send('1\n00:00:01,000 --> 00:00:06,000\n[Gemini AI] Chỉ hỗ trợ dịch từ phụ đề tiếng Anh.');
          }
          if (target && String(target).toLowerCase() !== 'vi') {
            return res.send('1\n00:00:01,000 --> 00:00:06,000\n[Gemini AI] Đích dịch phải là tiếng Việt.');
          }

          let cacheKey = '';

          // Silent stale/unarmed protection: an unselected/old subtitle URL must never
          // trigger source download, cache reuse, or Gemini. Return an empty body so
          // Nuvio/Stremio does not display the old subtitle when opening a new episode.
          // Newly advertised Gemini URLs carry the activation token in the path, which
          // survives clients that strip unknown query parameters such as `gate`.
          if (!isSubtitleActivationValid(imdbId, type, season, episode, gate)) {
            console.log('[translate-sub STALE BLOCK]', JSON.stringify({
              imdbId: imdbId || '', type: type || '',
              season: season || '', episode: episode || ''
            }));
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return res.send('');
          }

          try {
            const config = parseConfig(configQuery);
            console.log('[translate-sub request]', JSON.stringify({
              provider: provider || 'legacy',
              model: model || config.model || 'gemini-3.5-flash-lite',
              imdbId: imdbId || '',
              type: type || '',
              season: season || '',
              episode: episode || ''
            }));
            const geminiKeys = (config.geminiKeys && config.geminiKeys.length > 0)
              ? config.geminiKeys
              : [process.env.GEMINI_API_KEY].filter(Boolean);

            if (!geminiKeys.length) {
              return res.send('1\n00:00:01,000 --> 00:00:08,000\n[LỖI]: Chưa có Gemini API Key.');
            }

            const selectedModel = model || config.model || 'gemini-3.5-flash-lite';
            cacheKey = makeTranslationCacheKey({
              url,
              provider,
              fileId,
              sourceUrl,
              subtitleId,
              model: selectedModel,
              imdbId,
              type,
              season,
              episode
            });

            const cachedSrt = getCachedTranslation(cacheKey);
            if (cachedSrt) {
              console.log('[translate-sub CACHE HIT]', cacheKey.slice(0, 180));
              // This request has not written anything yet, so it is safe to change the cache header.
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
              return res.send(cachedSrt);
            }

              const existingJob = translationInFlight.get(cacheKey);
            if (existingJob) {
              console.log('[translate-sub REQUEST #2 WHILE RUNNING]', cacheKey.slice(0, 180));

              // Request #2 waits briefly for the already-running background job.
              // If translation finishes during this window, return the FINAL SRT
              // directly instead of another temporary status subtitle.
              try {
                const result = await Promise.race([
                  existingJob.promise,
                  new Promise(resolve => setTimeout(() => resolve(null), 15000))
                ]);

                if (result) {
                  console.log('[translate-sub REQUEST #2] FINAL READY FROM IN-FLIGHT JOB');
                  return res.send(normalizeSrtForPlayback(result));
                }
              } catch (waitErr) {
                console.error('[translate-sub REQUEST #2 wait]', waitErr.message || waitErr);
              }

              // Re-check cache because the job may have completed just after the wait.
              const finalAfterWait = getCachedTranslation(cacheKey);
              if (finalAfterWait) {
                console.log('[translate-sub REQUEST #2] FINAL CACHE HIT AFTER WAIT');
                return res.send(normalizeSrtForPlayback(finalAfterWait));
              }

              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
              return res.send('');
            }

            const jobEntry = {
              promise: null,
              resolve: null
            };
            jobEntry.promise = new Promise(resolve => {
              jobEntry.resolve = resolve;
            });
            translationInFlight.set(cacheKey, jobEntry);

            const statusState = {
              startedAt: Date.now(),
              done: 0,
              total: 1,
              model: selectedModel,
              etaSeconds: 30,
              finished: false,
              fallback: '',
              error: ''
            };

            console.log('[translate-sub REQUEST #1 NEW JOB]', cacheKey.slice(0, 180));
            console.log(
              `🔄 [Gemini AI] Request #1: trả trạng thái ngay, bắt đầu dịch nền | ` +
              `${imdbId || 'unknown'} | nguồn=${provider || 'legacy'} | model=${selectedModel}`
            );

            // Detach the long-running translation from HTTP Request #1.
            // The background task MUST NOT touch res.
            const backgroundJob = (async () => {
              try {
              let originalSrt;
              try {
                // v3.9.7: never call this Render app's own public /proxy-* URL from
                // /translate-sub. That creates an unnecessary Render edge round-trip
                // during the long Gemini request and is a common 502 failure point.
                const sourceConfig = config;
                if (provider === 'os') {
                  const apiKeyOS = sourceConfig.opensubtitlesKey || '2015';
                  if (!fileId) throw new Error('Thiếu OpenSubtitles file ID.');
                  const download = await axios.post(
                    'https://api.opensubtitles.com/api/v1/download',
                    { file_id: String(fileId) },
                    {
                      headers: {
                        'Api-Key': apiKeyOS,
                        ...API_HEADERS,
                        'Content-Type': 'application/json'
                      },
                      timeout: 10000,
                      validateStatus: status => status >= 200 && status < 300
                    }
                  );
                  const link = download.data?.link || '';
                  if (!link) throw new Error('OpenSubtitles không trả về link tải.');
                  originalSrt = await fetchSubtitleText(link, SUBTITLE_BROWSER_HEADERS, 25000, 1);
                } else if (provider === 'subdl') {
                  const key = String(sourceConfig.subdlKey || '');
                  if (!key) throw new Error('Thiếu SubDL API Key.');
                  if (!sourceUrl) throw new Error('Thiếu SubDL subtitle URL.');
                  originalSrt = await fetchSubtitleText(sourceUrl, {
                    ...SUBTITLE_BROWSER_HEADERS,
                    'X-API-Key': key,
                    'Authorization': `Bearer ${key}`
                  }, 25000, 1);
                } else if (provider === 'subsource') {
                  const key = String(sourceConfig.subsourceKey || '');
                  if (!key) throw new Error('Thiếu SubSource API Key.');
                  if (!subtitleId) throw new Error('Thiếu SubSource subtitle ID.');
                  const response = await axios.get(
                    `${SUBSOURCE_API}/subtitles/${encodeURIComponent(subtitleId)}/download`,
                    {
                      headers: getSubsourceHeaders(key),
                      responseType: 'arraybuffer',
                      timeout: 25000,
                      maxRedirects: 5,
                      validateStatus: status => status >= 200 && status < 300
                    }
                  );
                  originalSrt = extractSubtitleText(Buffer.from(response.data));
                } else {
                  // Backward compatibility for old addon URLs already cached by clients.
                  if (!url) throw new Error('Thiếu đường dẫn file phụ đề.');
                  originalSrt = await fetchSubtitleText(url, SUBTITLE_BROWSER_HEADERS, 25000, 1);
                }
              } catch (err) {
                console.error('[translate-sub source]', err.response?.status || '', err.code || '', err.message);
                throw new Error('Không tải được file phụ đề tiếng Anh: ' + String(err.message || 'upstream error').slice(0, 140));
              }

              console.log(`📥 [Gemini AI] Đã tải phụ đề gốc: ${String(originalSrt || '').length.toLocaleString()} ký tự`);

              let movieContext = 'Phim điện ảnh/truyền hình tổng quát. Chưa có metadata từ Cinemeta.';
              if (imdbId) {
                try {
                  const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type === 'series' ? 'series' : 'movie'}/${imdbId}.json`, { timeout: 5000 });
                  const meta = metaRes.data?.meta;
                  if (meta) {
                    movieContext =
                      `Tên phim: ${meta.name || ''}` +
                      `\nThể loại: ${Array.isArray(meta.genres) ? meta.genres.join(', ') : ''}` +
                      `\nMô tả Cinemeta: ${meta.description || ''}`;

                    if (type === 'series' && season && episode && Array.isArray(meta.videos)) {
                      const ep = meta.videos.find(v =>
                        v.season === parseInt(season, 10) &&
                        v.episode === parseInt(episode, 10)
                      );
                      if (ep) {
                        movieContext +=
                          `\nTập ${season}x${episode}: ${ep.name || ''}` +
                          `\nTóm tắt tập từ Cinemeta: ${ep.overview || ''}`;
                      }
                    }

                    const [imdbWeb, wiki] = await Promise.all([
                      fetchImdbWebContext(imdbId, meta.name || '').catch(() => ''),
                      fetchWikipediaContext(meta.name || '', meta.year || '').catch(() => '')
                    ]);
                    if (imdbWeb) movieContext += `\n\n${imdbWeb}`;
                    if (wiki) movieContext += `\n\n${wiki}`;
                  }
                } catch (err) {
                  console.error('[Movie web context]', err.message);
                }
              }

              // v3.9.48: build a character/relationship/pronoun guide for THIS EPISODE
              // BEFORE subtitle translation. The guide is generated once per episode/job,
              // then reused by every translation chunk for consistent localization.
              // Không dùng guide của tập khác.
              const subtitleSample = buildSubtitleContextSample(originalSrt, 4000);
              let sdhGuideEvidence = '';
              try {
                const sdhSrt = await fetchOpenSubtitlesSdhGuideSrt({ imdbId, type, season, episode, config });
                sdhGuideEvidence = buildSdhGuideEvidence(sdhSrt, 9000);
                console.log(sdhGuideEvidence ? `🦻 [SDH Guide] evidence ready | ${sdhGuideEvidence.length.toLocaleString()} chars` : '🦻 [SDH Guide] no usable evidence; dialogue fallback');
              } catch (err) {
                console.warn('[SDH Guide] failed; dialogue fallback:', err?.message || err);
              }
              let relationshipGuide = '';
              try {
                const guideKey = `${imdbId || 'unknown'}|S${season || 0}E${episode || 0}|${selectedModel}`;
                const cachedGuide = characterGuideCache.get(guideKey);
                if (cachedGuide && (Date.now() - cachedGuide.createdAt) < CHARACTER_GUIDE_CACHE_TTL_MS) {
                  relationshipGuide = cachedGuide.text;
                  console.log(`📚 [Character Guide] CACHE HIT | ${relationshipGuide.length.toLocaleString()} ký tự`);
                } else {
                  relationshipGuide = await buildCharacterRelationshipGuide({
                    movieContext,
                    subtitleSample,
                    sdhEvidence: sdhGuideEvidence,
                    geminiKeys,
                    model: selectedModel
                  });
                  if (relationshipGuide) {
                    characterGuideCache.set(guideKey, { createdAt: Date.now(), text: relationshipGuide });
                    console.log(`📚 [Character Guide] Đã tạo + cache sổ tay (${relationshipGuide.length.toLocaleString()} ký tự)`);
                  } else {
                    console.warn('[Character Guide] Không tạo được guide; tiếp tục dịch với metadata + mẫu thoại.');
                  }
                }
                while (characterGuideCache.size > 100) {
                  const oldestKey = characterGuideCache.keys().next().value;
                  characterGuideCache.delete(oldestKey);
                }
              } catch (err) {
                console.warn('[Character Guide] lỗi, bỏ qua guide:', err.message);
              }

              const contextGuide = `

          [BẢNG THÔNG TIN PHIM & SỔ TAY NHÂN VẬT]
          Thông tin phim từ Cinemeta/IMDb/Wikipedia:
          ${movieContext}

          Character/Relationship Guide 7 lớp (do AI xây dựng từ dữ liệu ở trên):
          ${relationshipGuide || 'Chưa có bảng phân tích; chỉ sử dụng thông tin phim và mẫu thoại làm bằng chứng.'}

          Mẫu thoại tham chiếu:
          ${subtitleSample}

          QUY TẮC SỬ DỤNG BẢNG:
          - Bảng là ngữ cảnh tham chiếu, không phải nội dung cần dịch.
          - Ưu tiên quan hệ/xưng hô/thuật ngữ có bằng chứng rõ ràng; nếu chưa chắc thì không tự suy đoán.
          - Guide gồm 7 lớp: Nhân vật, Quan hệ, Xưng hô, Thay đổi quan hệ, Giọng nhân vật, Thuật ngữ, Tóm tắt phim/tập.
          - Khi quan hệ thay đổi trong tập, ưu tiên trạng thái mới và áp dụng hiệu ứng xưng hô từ lớp Thay đổi quan hệ.
          - Không tự bịa quan hệ, tuổi, vai vế hoặc bối cảnh chưa được nguồn/bằng chứng hỗ trợ.
          - Giữ tên, biệt danh, chức danh và đại từ nhất quán giữa tất cả các chunk.
          - Nếu lời thoại mới cung cấp bằng chứng rõ ràng hơn bảng, ưu tiên bằng chứng mới và vẫn giữ nhất quán về sau.`;

              const chunks = splitSrtIntoChunks(originalSrt, 20000, 120);
              const translated = [];
              statusState.total = chunks.length;
              // This translation runs in the background after Request #1 has returned.
              // Never write to res from the background task.
              // Worker-key pool is initialized later, immediately before the worker scheduler.
              // Do not reference baseWorkerKeys here because it is block-scoped and not initialized yet.
              // v3.9.63: keep 20k/120-cue chunks to reduce large malformed Gemini outputs. All chunks may run concurrently and
              // may share the same key; per-key in-flight=5 and the 15 request
              // starts per rolling 60 seconds for each individual key.
              // The visible status message uses the requested simple movie/series estimate.
              statusState.etaSeconds = String(type || '').toLowerCase() === 'movie' ? 120 : 60;
              console.log(`📦 [Gemini AI] Đang sử dụng cơ chế đa luồng dịch phụ đề | ETA hiển thị theo loại: ${String(type || '').toLowerCase() === 'movie' ? '2 phút' : '1 phút'}`);

              // Three workers use the three independent Google projects to reduce wall-clock time
              // themselves take longer than the 8s per-project request-start interval.
              // The limiter in callAI() enforces the hard 15 request-starts/60s/key cap.
              // v3.9.48 CUE REPAIR: when Gemini drops only a few cues, do NOT
              // Detect failed source cues by their original timestamps, repair ONLY those
              // cues, then rebuild the chunk from the original timeline. No whole-chunk
              // retranslations or recursive cascade are used on the repair path.
              const cueIdentity = cue => `${cue.start}|${cue.end}`;

              // v3.9.59: repair ONLY the exact cues that failed validation.
              // Successful cues from the original Gemini response are never retransated.
              const getCueRepairTargets = (sourceCues, translatedCues) => {
                const targets = [];
                const sourceIds = new Set(sourceCues.map(cueIdentity));
                const translatedById = new Map();
                for (const cue of translatedCues) {
                  const id = cueIdentity(cue);
                  if (sourceIds.has(id) && !translatedById.has(id) && String(cue.body || '').trim()) {
                    translatedById.set(id, cue);
                  }
                }

                // Missing/empty cues are repaired by their original source timestamp.
                for (const source of sourceCues) {
                  const id = cueIdentity(source);
                  if (!translatedById.has(id)) targets.push(source);
                }

                // If timestamps were changed but cue count otherwise matches, compare by index.
                if (!targets.length && translatedCues.length === sourceCues.length) {
                  for (let i = 0; i < sourceCues.length; i++) {
                    const source = sourceCues[i];
                    const translated = translatedCues[i];
                    if (
                      source.start !== translated.start ||
                      source.end !== translated.end ||
                      !String(translated.body || '').trim()
                    ) {
                      targets.push(source);
                    }
                  }
                }

                const seen = new Set();
                return targets.filter(cue => {
                  const id = cueIdentity(cue);
                  if (seen.has(id)) return false;
                  seen.add(id);
                  return true;
                });
              };

              const extractRepairText = value => {
                let text = String(value || '')
                  .replace(/^\uFEFF/, '')
                  .replace(/```(?:srt|subtitle|text)?/gi, '')
                  .replace(/```/g, '')
                  .trim();

                // Gemini may still return an SRT cue despite being asked for text only.
                // Accept that format as a fallback, but never trust its timestamp/number.
                const parsed = parseSrtCues(text);
                if (parsed.length === 1 && String(parsed[0].body || '').trim()) {
                  return String(parsed[0].body).trim();
                }

                // Remove common answer labels/quotes without trying to rewrite the text.
                text = text
                  .replace(/^\s*(?:bản\s*dịch|dịch|translation|answer|output)\s*:\s*/i, '')
                  .trim();
                if ((text.startsWith('"') && text.endsWith('"')) ||
                    (text.startsWith('“') && text.endsWith('”'))) {
                  text = text.slice(1, -1).trim();
                }
                return text;
              };

              // v3.9.63 BATCH REPAIR:
              // If Gemini returns N bad/missing cues, repair ALL of those cues in ONE
              // Gemini request instead of N individual requests. This drastically reduces
              // request count and avoids hitting per-key RPM/request limits during repair.
              const repairFailedCuesBatch = async (cues, label, orderedKeys, keyIndexMap = null, chunkIndex = -1) => {
                if (!Array.isArray(cues) || !cues.length) return [];

                const numberedCues = cues.map((cue, index) => ({
                  repairId: index + 1,
                  cue
                }));

                const repairPrompt = `Bạn là dịch giả phụ đề phim chuyên nghiệp.

        Dịch TẤT CẢ các cue bên dưới sang tiếng Việt tự nhiên.
        - Mỗi CUE phải được dịch đúng MỘT lần.
        - Giữ nguyên đầy đủ ý nghĩa, sắc thái, tên riêng, thuật ngữ và cách xưng hô theo ngữ cảnh.
        - KHÔNG dịch, gộp hoặc tách cue nào khác.
        - KHÔNG trả về timestamp.
        - KHÔNG trả về số thứ tự SRT.
        - KHÔNG trả về markdown, giải thích, nhận xét hoặc nhãn "Bản dịch:".
        - Trả về JSON ARRAY hợp lệ và CHỈ JSON.
        - Mỗi phần tử phải có đúng dạng: {"id":1,"text":"bản dịch tiếng Việt"}.
        - "id" phải khớp tuyệt đối với ID cue được cung cấp.
        - Phải trả về ĐỦ ${numberedCues.length} ID, không được bỏ sót.
        - Không thêm ID ngoài danh sách.
        - Nếu cue có xuống dòng, giữ nội dung trong trường "text" bằng \\n hợp lệ JSON.
        ${contextGuide}${chunkIndex >= 0 ? buildOverlapPrompt(chunkIndex) : ''}

        CÁC CUE CẦN REPAIR:
        ${numberedCues.map(({ repairId, cue }) =>
          `[CUE ${repairId}]
        ${cue.body}`
        ).join('\n\n')}`;

                const result = await callAIWithModelFallback(
                  repairPrompt,
                  orderedKeys,
                  selectedModel,
                  0,
                  keyIndexMap
                );

                if (!result?.result) {
                  throw new Error(`${label}: batch repair không có kết quả`);
                }

                const raw = stripMarkdownCodeFence(result.result);
                let parsed;

                try {
                  parsed = JSON.parse(raw);
                } catch (err) {
                  // Fallback: accept a JSON object containing a common array field.
                  try {
                    const objectMatch = raw.match(/\{[\s\S]*\}/);
                    if (objectMatch) {
                      const obj = JSON.parse(objectMatch[0]);
                      parsed = obj.cues || obj.repairs || obj.results || obj.data;
                    }
                  } catch {}
                }

                if (!Array.isArray(parsed)) {
                  throw new Error(`${label}: batch repair trả về JSON không hợp lệ`);
                }

                const sourceById = new Map(numberedCues.map(item => [item.repairId, item.cue]));
                const repairedById = new Map();

                for (const item of parsed) {
                  const id = Number(item?.id);
                  const sourceCue = sourceById.get(id);
                  const repairedText = extractRepairText(item?.text);

                  if (!sourceCue || !repairedText || repairedById.has(id)) continue;

                  repairedById.set(id, {
                    start: sourceCue.start,
                    end: sourceCue.end,
                    body: repairedText
                  });
                }

                if (repairedById.size !== numberedCues.length) {
                  throw new Error(
                    `${label}: batch repair thiếu kết quả ${repairedById.size}/${numberedCues.length} cue`
                  );
                }

                const repaired = numberedCues.map(item => repairedById.get(item.repairId));

                console.log(
                  `🩹 [Gemini AI] ${label}: batch repair OK ${repaired.length}/${numberedCues.length} cue | 1 request`
                );

                return repaired;
              };

              const mergeFailedCueRepairs = async (sourceChunk, translatedText, label, orderedKeys, keyIndexMap = null, chunkIndex = -1) => {
                const sourceCues = parseSrtCues(sourceChunk);
                const translatedCues = parseSrtCues(translatedText || '');
                if (!sourceCues.length || !translatedCues.length) return null;

                const targets = getCueRepairTargets(sourceCues, translatedCues);
                if (!targets.length) return null;

                console.warn(`🩹 [Gemini AI] ${label}: phát hiện ${targets.length} cue lỗi/thiếu; CHỈ batch repair các cue này trong 1 request.`);

                const translatedById = new Map();
                for (const cue of translatedCues) {
                  const id = cueIdentity(cue);
                  if (!translatedById.has(id) && String(cue.body || '').trim()) {
                    translatedById.set(id, cue);
                  }
                }

                // v3.9.63: ALL failed cues are sent together in ONE Gemini request.
                // Do not create one request per cue and do not use a concurrent repair pool.
                const repaired = await repairFailedCuesBatch(
                  targets,
                  label,
                  orderedKeys,
                  keyIndexMap,
                  chunkIndex
                );

                for (const cue of repaired) {
                  if (cue) translatedById.set(cueIdentity(cue), cue);
                }

                const merged = sourceCues.map(source => {
                  const translated = translatedById.get(cueIdentity(source));
                  return {
                    start: source.start,
                    end: source.end,
                    body: String(translated?.body || '').trim()
                  };
                });

                if (merged.some(cue => !cue.body)) {
                  throw new Error(`${label}: vẫn còn cue chưa có nội dung sau batch repair`);
                }

                const result = buildSrtFromCues(merged);
                const finalCheck = validateCueStructure(sourceChunk, result, label);
                if (!finalCheck.ok) {
                  throw new Error(`${label}: batch repair vẫn sai cấu trúc: ${finalCheck.reason}`);
                }

                console.log(`🩹 [Gemini AI] ${label}: batch repair đúng ${repaired.length}/${targets.length} cue lỗi | 1 request Gemini.`);
                return result;
              };

              const validateCueStructure = (sourceChunk, translatedText, label) => {
                const sourceCues = parseSrtCues(sourceChunk);
                const translatedCues = parseSrtCues(translatedText || '');
                if (translatedCues.length !== sourceCues.length) {
                  return { ok: false, reason: `cue count ${sourceCues.length} -> ${translatedCues.length}`, sourceCues, translatedCues };
                }
                for (let i = 0; i < sourceCues.length; i++) {
                  if (translatedCues[i].start !== sourceCues[i].start || translatedCues[i].end !== sourceCues[i].end) {
                    return {
                      ok: false,
                      reason: `timestamp cue ${i + 1}: ${srtMs(sourceCues[i].start)} --> ${srtMs(sourceCues[i].end)} != ${srtMs(translatedCues[i].start)} --> ${srtMs(translatedCues[i].end)}`,
                      sourceCues,
                      translatedCues
                    };
                  }
                  if (!String(translatedCues[i].body || '').trim()) {
                    return { ok: false, reason: `empty body cue ${i + 1}`, sourceCues, translatedCues };
                  }
                }
                return { ok: true, sourceCues, translatedCues };
              };

              const OVERLAP_CONTEXT_CUES = 12;
              const getOverlapContext = (chunkIndex) => {
                if (chunkIndex <= 0) return '';
                const previousChunk = chunks[chunkIndex - 1];
                if (!previousChunk) return '';
                const previousCues = parseSrtCues(previousChunk);
                if (!previousCues.length) return '';
                const tail = previousCues.slice(-OVERLAP_CONTEXT_CUES);
                return buildSrtFromCues(tail);
              };

              const buildOverlapPrompt = (chunkIndex) => {
                const overlap = getOverlapContext(chunkIndex);
                if (!overlap) return '';
                return `\n\n[NGỮ CẢNH GỐI ĐẦU — CHUNK TRƯỚC]\nĐây là ${Math.min(OVERLAP_CONTEXT_CUES, parseSrtCues(chunks[chunkIndex - 1] || '').length)} cue cuối của chunk ngay trước. Chỉ dùng để hiểu mạch hội thoại, nhân vật, quan hệ và cách xưng hô. KHÔNG dịch lại, KHÔNG đưa các cue này vào kết quả.\n${overlap}\n[HẾT NGỮ CẢNH GỐI ĐẦU]`;
              };

              const translateOneValidated = async (sourceChunk, label, orderedKeys, keyIndexMap, expectedCueCount, chunkIndex = -1) => {
                const basePrompt = `Bạn là dịch giả phụ đề phim chuyên nghiệp, chuyên Việt hóa lời thoại điện ảnh.

        MỤC TIÊU:
        Dịch đoạn SRT tiếng Anh dưới đây sang tiếng Việt tự nhiên, đúng sắc thái và đúng bối cảnh. ${contextGuide}${chunkIndex >= 0 ? buildOverlapPrompt(chunkIndex) : ''}

        NGUYÊN TẮC XƯNG HÔ:
        - Ưu tiên tuyệt đối thông tin nhân vật/quan hệ có bằng chứng trong phần ngữ cảnh ở trên.
        - Giữ nhất quán cách xưng hô giữa các nhân vật xuyên suốt bộ phim.
        - Không thay đổi cách xưng hô chỉ vì một câu thoại đứng riêng lẻ.
        - Khi quan hệ chưa xác định, dùng ngữ cảnh câu thoại để chọn cách xưng hô tự nhiên nhất nhưng KHÔNG bịa quan hệ.
        - Phân biệt đại từ người nói với từ gọi người nghe; không dịch máy móc "you" thành một đại từ cố định.
        - Giữ tên riêng, chức danh, biệt danh và thuật ngữ quan trọng nhất quán.
        - Tên/alias/term có translate=false trong Character Guide là PROTECTED TOKEN: giữ nguyên 100%, không dịch nghĩa, Việt hóa hoặc diễn giải. Ví dụ Malivore phải vẫn là Malivore.
        - Trước khi chọn đại từ, xác định người nói/người nghe và xét kinship, hierarchy, relative_age, gender, quan hệ và mức thân mật.
        - SELF là cách người nói tự xưng; ADDRESS là cách người nói gọi người nghe. Không đảo SELF/ADDRESS.
        - QUY TẮC ÁNH XẠ CỨNG: I/me/my/mine của speaker → SELF của đúng hướng speaker→listener; you/your/yours chỉ listener → ADDRESS của đúng hướng speaker→listener.
        - Ví dụ Guide có A→B = SELF "cháu", ADDRESS "ông": khi A nói "I know you" phải theo hướng "cháu ... ông"; tuyệt đối không đảo thành "ông ... cháu".
        - Trước mỗi cue có đại từ ngôi 1/ngôi 2, xác định speaker và listener trước rồi mới chọn đúng a_to_b hoặc b_to_a. Nếu chưa xác định chắc speaker/listener, không được tự đảo cặp chỉ để câu nghe quen tai.
        - Không dùng ADDRESS cho I/me/my/mine; không dùng SELF cho you/your/yours.
        - Nếu Guide đã khóa A→B hoặc B→A thì giữ đúng hướng đó xuyên suốt các chunk.
        - LIÊN TỤC TRONG CÙNG CHUNK: nếu các cue liền nhau vẫn là cùng speaker→listener và không có bằng chứng rõ về đổi register/quan hệ, tái sử dụng chính xác cặp SELF/ADDRESS đã khóa; không tự đổi em→tôi, anh→tôi, cháu→tôi... chỉ để câu nghe mạnh hoặc tự nhiên hơn.
        - DIALOGUE-PAIR INHERITANCE: khi cue hiện tại không tự chứa đủ thông tin speaker/listener nhưng nằm trong cùng lượt/hội thoại liền kề, kế thừa speaker→listener và cặp SELF/ADDRESS gần nhất đã được xác định chắc chắn. Chỉ ngừng kế thừa khi có evidence rõ về đổi speaker, listener, cảnh hoặc đối tượng giao tiếp.
        - NO NEUTRAL FALLBACK DRIFT: nếu speaker→listener đã có locked pair, tuyệt đối không tự rơi về “tôi/bạn”, “tôi/anh”, “tôi/chị” hoặc một cặp trung tính khác chỉ vì câu tiếng Anh hiện tại ngắn/mơ hồ. Ví dụ locked SELF=em, ADDRESS=anh thì “And I'll stand here” phải tiếp tục dùng SELF=em nếu vẫn cùng speaker→listener.
        - Nếu chưa chắc cue là lời của ai nhưng continuity mạnh hơn mọi giả thuyết khác, ưu tiên khóa của lượt hội thoại đang tiếp diễn; KHÔNG bịa một speaker/listener mới chỉ để hợp một câu đơn lẻ.
        - Giận dữ/phẫn nộ/buồn/sợ/ghen/căng thẳng/mỉa mai/đe dọa KHÔNG tự nó cho phép đổi đại từ. Thể hiện cảm xúc bằng từ vựng, nhịp câu, mức trực diện và sắc thái, trong khi vẫn giữ SELF/ADDRESS.
        - Chỉ được đổi cặp xưng hô khi có bằng chứng trong lời thoại/ngữ cảnh rằng listener thay đổi, quan hệ/vai vế giao tiếp thực sự thay đổi, hoặc nhân vật cố ý chuyển register/cách xưng hô. Không có bằng chứng đó thì GIỮ KHÓA.
        - Trước khi trả kết quả của chunk, tự rà lại các cue liền nhau có cùng speaker→listener và sửa mọi trường hợp SELF/ADDRESS bị trôi hoặc đảo ngoài các ngoại lệ có bằng chứng rõ.
        - Trong lượt rà cuối, đặc biệt tìm các cue đột ngột xuất hiện “tôi/bạn” hoặc SELF/ADDRESS khác giữa một dialogue pair đang khóa; nếu không có evidence đổi người/đổi register thì phục hồi đúng cặp đã khóa.
        - Không mặc định mọi nam/nữ là anh/em; không tự đổi ông/cháu, bà/cháu, bác/cháu, chú/cháu, cô/cháu sang anh/em hoặc cậu/tớ khi Guide có bằng chứng rõ.
        - Nếu câu thoại có sắc thái kính trọng, khinh miệt, thân mật, đe dọa, mỉa mai... hãy thể hiện bằng tiếng Việt nhưng không tự động đổi SELF/ADDRESS chỉ vì sắc thái đó.
        - Không đưa ghi chú của người dịch vào phụ đề.

        ĐỊNH DẠNG BẮT BUỘC:
        - Đoạn nguồn có ĐÚNG ${expectedCueCount} cue. Phải trả về ĐÚNG ${expectedCueCount} cue.
        - Giữ nguyên tuyệt đối từng số thứ tự và từng timestamp.
        - MỖI cue nguồn phải có đúng MỘT cue dịch; không gộp, không tách, không bỏ qua kể cả cue rất ngắn.
        - Không được thay đổi, làm tròn, nối hoặc suy đoán timestamp.
        - Chỉ dịch phần text của từng cue.
        - Chỉ trả về SRT đã dịch, không markdown, không giải thích.

        SRT CẦN DỊCH:
        ${sourceChunk}`;

                let last = await callAIWithModelFallback(basePrompt, orderedKeys, selectedModel, 0, keyIndexMap);
                if (last?.result) {
                  let validation = validateCueStructure(sourceChunk, last.result, label);
                  console.log(`[Gemini AI] Kiểm tra ${label}: nguồn=${expectedCueCount}, dịch=${validation.translatedCues.length}, timestamp=${validation.ok ? 'OK' : 'MISMATCH'}`);
                  if (validation.ok) return last.result.trim();

                  // v3.9.60: CHỈ repair những cue thực sự lỗi/thiếu.
                  // Không retry lại toàn bộ chunk, dù có 1 hay nhiều cue lỗi.
                  // Cue đã OK được giữ nguyên tuyệt đối.
                  const repaired = await mergeFailedCueRepairs(sourceChunk, last.result, label, orderedKeys, keyIndexMap, chunkIndex);
                  if (repaired && parseSrtCues(repaired).length === expectedCueCount) {
                    return repaired.trim();
                  }
                }
                throw new Error(`${label}: không thể hoàn tất sau khi validation/retry/repair`);
              };

              const translateChunk = async (i, workerKey, workerIndex = 0) => {
                const startedAt = Date.now();
                const sourceChunk = chunks[i];
                const expectedCueCount = parseSrtCues(sourceChunk).length;
                const primaryIndex = Math.max(0, Math.min(baseWorkerKeys.length - 1, Number(workerIndex) || 0));
                const orderedKeys = baseWorkerKeys.slice(primaryIndex).concat(baseWorkerKeys.slice(0, primaryIndex));
                const keyIndexMap = orderedKeys.map((_, localIndex) =>
                  (primaryIndex + localIndex) % Math.max(1, baseWorkerKeys.length)
                );
                const keyHint = `${String(workerKey).slice(0, 4)}…${String(workerKey).slice(-4)}`;
                console.log(`⏳ [Gemini AI] Đang dịch chunk ${i + 1}/${chunks.length} | ${expectedCueCount} cue | task-key-index=${primaryIndex + 1}/${baseWorkerKeys.length} | key #${primaryIndex + 1} | key=${keyHint}`);

                try {
                  const result = await translateOneValidated(sourceChunk, `chunk ${i + 1}/${chunks.length}`, orderedKeys, keyIndexMap, expectedCueCount, i);
                  translated.push({ index: i, text: result });
                  statusState.done = translated.length;
                  console.log(`✅ [Gemini AI] Xong chunk ${i + 1}/${chunks.length} | ${((Date.now() - startedAt) / 1000).toFixed(1)}s | ${expectedCueCount} cue`);
                } catch (firstErr) {
                  console.error(`❌ [Gemini AI] Chunk ${i + 1}/${chunks.length} thất bại sau khi chỉ repair cue lỗi: ${firstErr.message}`);
                  throw firstErr;
                }
              };

              const baseWorkerKeys = geminiKeys.slice(0, 3);
              // v3.9.66: one worker per chunk. Per-key concurrency is still enforced
              // by GEMINI_MAX_IN_FLIGHT_PER_KEY inside withGeminiKeySlot().
              const activeWorkerCount = chunks.length;

              console.log(`🚀 [Gemini AI] Multi-request: ${activeWorkerCount} worker | ${chunks.length} chunk | ${baseWorkerKeys.length} key | ${GEMINI_MAX_IN_FLIGHT_PER_KEY} in-flight/key | hard cap 15 starts/60s/key`);

              // Pull chunks from one shared queue. This avoids launching every chunk at
              // once and prevents a long subtitle from creating a huge Promise.all set.
              let nextChunkIndex = 0;
              const chunkWorker = async workerIndex => {
                while (true) {
                  const i = nextChunkIndex++;
                  if (i >= chunks.length) return;
                  const keyIndex = workerIndex % Math.max(1, baseWorkerKeys.length);
                  const workerKey = baseWorkerKeys[keyIndex];
                  await translateChunk(i, workerKey, keyIndex);
                }
              };

              await Promise.all(
                Array.from({ length: activeWorkerCount }, (_, i) => chunkWorker(i))
              );

              console.log(`🎉 [Gemini AI] Dịch hoàn tất ${translated.length}/${chunks.length} chunk. Đang ghép SRT...`);

              // Workers finish out of order; restore the original SRT chunk order.
              translated.sort((a, b) => a.index - b.index);

              // v3.9.34: rebuild the final subtitle timeline from ORIGINAL SRT cues.
              // This prevents Gemini timestamp drift/duplication from causing subtitle
              // overlap, double-rendering, and seek artifacts on Android TV/Media3.
              const finalSrt = rebuildTranslatedSrtFromSource(chunks, translated);
              const finalNormalizedSrt = normalizeSrtForPlayback(finalSrt);
              if (!finalNormalizedSrt) throw new Error('Bản dịch cuối rỗng sau khi chuẩn hóa SRT.');
              console.log(`📤 [Gemini AI] Đã ghép SRT theo timestamp gốc và lưu cache | ${finalNormalizedSrt.length.toLocaleString()} ký tự`);
              setCachedTranslation(cacheKey, finalNormalizedSrt);

              // Verify that the FINAL SRT is immediately readable from cache.
              const verifiedFinalSrt = getCachedTranslation(cacheKey);
              if (!verifiedFinalSrt) {
                throw new Error('Không xác minh được FINAL SRT trong translation cache.');
              }
              console.log(`[translate-sub FINAL CACHE READY] ${cacheKey.slice(0, 180)} | ${verifiedFinalSrt.length.toLocaleString()} ký tự`);
              console.log(`🟢 [Gemini AI] SAME TRACK READY: lần request tiếp theo của chính URL Gemini này sẽ trả SRT Việt.`);

              if (jobEntry?.resolve) jobEntry.resolve(verifiedFinalSrt);
              statusState.finished = true;
              statusState.fallback = '';
              statusState.etaSeconds = 0;
              console.log(`🟢 [Gemini AI] Background job hoàn tất | cache ready | ${cacheKey.slice(0, 120)}`);
              // Request #1 has already returned the temporary status SRT.
              // The completed SRT is delivered only when a later request hits the cache.
              return finalNormalizedSrt;

              } catch (err) {
                const errorMessage = String(err.message || err).replace(/\r?\n/g, ' ').slice(0, 300);
                console.error('❌ [Gemini AI] Dịch thất bại:', err.stack || err.message || err);
                const errorSrt =
                  `1\n00:00:01,000 --> 00:00:10,000\n[Gemini AI] Không thể dịch phụ đề: ${errorMessage}`;
                statusState.error = errorMessage;
                if (jobEntry?.resolve) jobEntry.resolve(errorSrt);
                console.error('[translate-sub BACKGROUND ERROR]', errorMessage);
              } finally {
                const entry = translationInFlight.get(cacheKey);
                if (entry === jobEntry) {
                  translationInFlight.delete(cacheKey);
                }
                console.log('[translate-sub JOB RELEASED]', cacheKey.slice(0, 180));
              }
            })();

            // Render: the Node process remains alive after the response.
            // Vercel/Fluid Compute: explicitly attach the same promise to the invocation
            // lifecycle so the translation cannot be discarded when Request #1 responds.
            if (vercelWaitUntil) {
              vercelWaitUntil(backgroundJob);
              console.log('[translate-sub VERCEL WAITUNTIL ATTACHED]', cacheKey.slice(0, 180));
            } else {
              void backgroundJob.catch(err => {
                console.error('[translate-sub background detached]', err);
              });
            }

            // Request #1 is the click-trigger: return ONE status subtitle now while
            // the detached Gemini job continues in the background. A later Reload
            // requests the same URL and receives the cached final Vietnamese SRT.
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            const isMovie = String(type || '').toLowerCase() === 'movie';
            const expectedTime = isMovie ? '60 giây' : '30 giây';
            const mediaLabel = isMovie ? 'phim lẻ' : 'phim bộ';
            const statusMessage =
              `🟡 Gemini AI đang dịch phụ đề...\n` +
              `⏱️ Dự kiến ${mediaLabel}: khoảng ${expectedTime}\n` +
              `⚡ Đang sử dụng cơ chế đa luồng dịch phụ đề\n` +
              `🔄 Khi dịch xong, bấm Reload phụ đề để nhận bản Việt.`;
            return res.send(makeStatusSrt(statusMessage, 3600));
          } catch (err) {
            console.error('[translate-sub setup]', err.stack || err.message || err);
            return res.send(
              `1\n00:00:01,000 --> 00:00:10,000\n[Gemini AI] Không thể bắt đầu dịch: ${String(err.message || err).replace(/\r?\n/g, ' ')}`
            );
          }
        });

        app.get('/subtitles/:type/:id.json', (req, res) => handleSubtitles(req, res, null));
        app.get('/subtitles/:type/:id/:extra.json', (req, res) => handleSubtitles(req, res, null));
        app.get('/:config/subtitles/:type/:id.json', (req, res) => handleSubtitles(req, res, req.params.config));
        app.get('/:config/subtitles/:type/:id/:extra.json', (req, res) => handleSubtitles(req, res, req.params.config));

        const server = app.listen(PORT, '0.0.0.0', () => {
          console.log(`NothingP AIOsubtitles đang chạy tại port ${PORT}`);
        });

        // Render's edge proxy can return 502 when a Node request/connection is
        // closed or left idle while a long Gemini translation is still running.
        // Keep the Node side of the connection open long enough for long subtitle jobs.
        server.keepAliveTimeout = 120000;
        server.headersTimeout = 125000;
        server.requestTimeout = 0;
