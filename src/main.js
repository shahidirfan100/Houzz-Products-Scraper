// Houzz Products Scraper - Constructor.io API implementation (FAST)
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
        const RESULTS_PER_PAGE = 50; // Increased for faster fetching

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        // Generate unique identifiers for API requests
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

        async function fetchSearchResults(searchQuery, page) {
            const url = new URL(`${CONSTRUCTOR_BASE_URL}/search/${encodeURIComponent(searchQuery)}`);
            url.searchParams.set('key', CONSTRUCTOR_API_KEY);
            url.searchParams.set('i', userId);
            url.searchParams.set('s', String(sessionId++));
            url.searchParams.set('page', String(page));
            url.searchParams.set('num_results_per_page', String(RESULTS_PER_PAGE));
            url.searchParams.set('sort_by', 'relevance');
            url.searchParams.set('sort_order', 'descending');
            url.searchParams.set('c', 'ciojs-client-2.72.0');

            const options = {
                url: url.href,
                responseType: 'json',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Origin': 'https://shophouzz.com',
                    'Referer': 'https://shophouzz.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },
                timeout: { request: 30000 },
                retry: { limit: 3 },
            };

            if (proxyConf) {
                options.proxyUrl = await proxyConf.newUrl();
            }

            const response = await gotScraping(options);
            return response.body;
        }

        function cleanImageUrl(imageUrl) {
            if (!imageUrl) return null;
            // Ensure URL starts with https
            let url = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
            if (!url.startsWith('http')) url = `https:${url}`;

            // Remove query parameters to get clean .jpg URL
            try {
                const parsed = new URL(url);
                return `${parsed.origin}${parsed.pathname}`;
            } catch {
                return url.split('?')[0];
            }
        }

        function parseProduct(item) {
            const data = item.data || {};

            // Extract price
            let price = null;
            let original_price = null;
            if (data.price !== undefined) {
                price = `$${parseFloat(data.price).toFixed(2)}`;
            }
            if (data.compareAtPrice && parseFloat(data.compareAtPrice) > parseFloat(data.price)) {
                original_price = `$${parseFloat(data.compareAtPrice).toFixed(2)}`;
            }

            // Extract and clean image URL
            const image_url = cleanImageUrl(data.image_url);

            // Build product URL
            const handle = data.url;
            const url = handle ? `https://shophouzz.com${handle.startsWith('/') ? '' : '/'}${handle}` : null;

            // Extract rating and review count from API
            const rating = data.rating ? parseFloat(data.rating) : null;
            const review_count = data.rating_count ? parseInt(data.rating_count, 10) : null;

            // Extract SKU (using barcode or id)
            const sku = data.barcode || data.houzz_product_id || data.id || null;

            // Extract product type and specifications
            const product_type = data.style || null;
            const specifications = data.materials || null;

            return {
                title: item.value || null,
                brand: data.manufacturer || data.vendor || null,
                price,
                original_price,
                image_url,
                rating,
                review_count,
                description: null, // API doesn't provide full description
                specifications,
                url,
                sku,
                product_type,
            };
        }

        const searchQuery = query?.trim() || 'sofa';
        log.info(`🔍 Starting search for: "${searchQuery}"`);
        log.info(`📊 Target: ${RESULTS_WANTED} products, max ${MAX_PAGES} pages`);

        let currentPage = 1;
        let totalResults = 0;
        let hasMorePages = true;

        while (hasMorePages && saved < RESULTS_WANTED && currentPage <= MAX_PAGES) {
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

                log.info(`📦 Page ${currentPage}/${numPages} → Found ${results.length} products (Total available: ${totalResults})`);

                for (const item of results) {
                    if (saved >= RESULTS_WANTED) break;

                    const product = parseProduct(item);
                    if (!product.url || seenUrls.has(product.url)) continue;
                    seenUrls.add(product.url);

                    batchBuffer.push(product);
                    saved++;
                    await pushBatch();
                }

                hasMorePages = currentPage < numPages;
                currentPage++;
            } catch (err) {
                log.error(`❌ Error on page ${currentPage}: ${err.message}`);
                currentPage++;
            }
        }

        await pushBatch(true);
        log.info(`✅ Completed! Saved ${saved} products`);

    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
