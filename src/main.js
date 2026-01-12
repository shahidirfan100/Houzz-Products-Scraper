// Houzz Products Scraper - Constructor.io API (FAST + STEALTHY)
import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';

// Constructor.io API configuration
const CONSTRUCTOR_API_KEY = 'key_V5Io4KQzrjzso85q';
const CONSTRUCTOR_BASE_URL = 'https://ac.cnstrc.com';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            query = 'sofa',
            results_wanted: RESULTS_WANTED_RAW = 20,
            max_pages: MAX_PAGES_RAW = 20,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;
        const RESULTS_PER_PAGE = Math.min(100, RESULTS_WANTED);

        // Initialize proxy with fast datacenter settings
        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : await Actor.createProxyConfiguration({ useApifyProxy: true });

        // Generate unique identifiers
        const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        const userId = generateUUID();
        let sessionId = 1;
        let saved = 0;
        let batchBuffer = [];
        const seenUrls = new Set();

        async function pushBatch(force = false) {
            if (batchBuffer.length >= 10 || (force && batchBuffer.length > 0)) {
                await Actor.pushData(batchBuffer);
                log.info(`✓ Pushed ${batchBuffer.length} products (Total: ${saved})`);
                batchBuffer = [];
            }
        }

        async function fetchSearchResults(searchQuery, page, retryCount = 0) {
            const url = new URL(`${CONSTRUCTOR_BASE_URL}/search/${encodeURIComponent(searchQuery)}`);
            url.searchParams.set('key', CONSTRUCTOR_API_KEY);
            url.searchParams.set('i', userId);
            url.searchParams.set('s', String(sessionId++));
            url.searchParams.set('page', String(page));
            url.searchParams.set('num_results_per_page', String(RESULTS_PER_PAGE));
            url.searchParams.set('sort_by', 'relevance');
            url.searchParams.set('sort_order', 'descending');
            url.searchParams.set('c', 'ciojs-client-2.72.0');
            url.searchParams.set('_dt', String(Date.now()));

            const proxyUrl = await proxyConf.newUrl();

            try {
                const response = await gotScraping({
                    url: url.href,
                    proxyUrl,
                    responseType: 'json',
                    timeout: { request: 15000 },
                    retry: { limit: 0 },
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Origin': 'https://shophouzz.com',
                        'Referer': 'https://shophouzz.com/',
                        'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'cross-site',
                    },
                });
                return response.body;
            } catch (err) {
                if (retryCount < 2) {
                    log.warning(`Retry ${retryCount + 1} for page ${page}: ${err.message}`);
                    await new Promise(r => setTimeout(r, 500));
                    return fetchSearchResults(searchQuery, page, retryCount + 1);
                }
                throw err;
            }
        }

        function cleanImageUrl(imageUrl) {
            if (!imageUrl) return null;
            let url = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
            if (!url.startsWith('http')) url = `https:${url}`;
            try {
                const parsed = new URL(url);
                return `${parsed.origin}${parsed.pathname}`;
            } catch {
                return url.split('?')[0];
            }
        }

        function parseProduct(item) {
            const data = item.data || {};

            let price = null;
            let original_price = null;
            if (data.price !== undefined && data.price !== null) {
                price = `$${parseFloat(data.price).toFixed(2)}`;
            }
            if (data.compareAtPrice && parseFloat(data.compareAtPrice) > parseFloat(data.price || 0)) {
                original_price = `$${parseFloat(data.compareAtPrice).toFixed(2)}`;
            }

            const image_url = cleanImageUrl(data.image_url);
            const handle = data.url;
            const url = handle ? `https://shophouzz.com${handle.startsWith('/') ? '' : '/'}${handle}` : null;

            return {
                title: item.value || null,
                brand: data.manufacturer || data.vendor || null,
                price,
                original_price,
                image_url,
                rating: data.rating !== undefined ? parseFloat(data.rating) : null,
                review_count: data.rating_count !== undefined ? parseInt(data.rating_count, 10) : null,
                description: null,
                specifications: data.materials || null,
                url,
                sku: data.barcode || data.houzz_product_id || data.id || null,
                product_type: data.style || null,
            };
        }

        const searchQuery = query?.trim() || 'sofa';
        log.info(`🔍 Starting search for: "${searchQuery}"`);
        log.info(`📊 Target: ${RESULTS_WANTED} products, max ${MAX_PAGES} pages`);

        let currentPage = 1;
        let totalResults = 0;

        while (saved < RESULTS_WANTED && currentPage <= MAX_PAGES) {
            try {
                log.info(`📄 Fetching page ${currentPage}...`);
                const data = await fetchSearchResults(searchQuery, currentPage);

                if (!data.response?.results || data.response.results.length === 0) {
                    log.info(`📭 No more results on page ${currentPage}`);
                    break;
                }

                const results = data.response.results;
                totalResults = data.response.total_num_results || totalResults;
                const numPages = Math.ceil(totalResults / RESULTS_PER_PAGE);

                log.info(`📦 Page ${currentPage}/${numPages} → Found ${results.length} products`);

                for (const item of results) {
                    if (saved >= RESULTS_WANTED) break;

                    const product = parseProduct(item);
                    if (!product.url || seenUrls.has(product.url)) continue;
                    seenUrls.add(product.url);

                    batchBuffer.push(product);
                    saved++;
                    await pushBatch();
                }

                currentPage++;
            } catch (err) {
                log.error(`❌ Error on page ${currentPage}: ${err.message}`);
                break;
            }
        }

        await pushBatch(true);
        log.info(`✅ Completed! Saved ${saved} products`);

    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
