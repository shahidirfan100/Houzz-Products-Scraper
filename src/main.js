// Houzz Products Scraper - Constructor.io API implementation
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
            collectDetails = true,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;
        const RESULTS_PER_PAGE = 24;

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

        async function fetchProductDetails(productUrl) {
            try {
                const options = {
                    url: productUrl,
                    responseType: 'text',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    },
                    timeout: { request: 30000 },
                    retry: { limit: 2 },
                };

                if (proxyConf) {
                    options.proxyUrl = await proxyConf.newUrl();
                }

                const response = await gotScraping(options);
                const html = response.body;

                // Extract description from meta tag or structured data
                let description = null;
                const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
                if (metaDescMatch) {
                    description = metaDescMatch[1];
                }

                // Extract JSON-LD for more details
                let specifications = null;
                const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
                if (jsonLdMatch) {
                    try {
                        const jsonLd = JSON.parse(jsonLdMatch[1]);
                        if (jsonLd.description) {
                            description = description || jsonLd.description;
                        }
                    } catch (e) { }
                }

                return { description, specifications };
            } catch (err) {
                log.warning(`Detail fetch failed for ${productUrl}: ${err.message}`);
                return { description: null, specifications: null };
            }
        }

        function parseProduct(item) {
            const data = item.data || {};
            const metadata = item.value_and_metadata_for_terms?.data || {};

            // Extract price
            let price = null;
            let original_price = null;
            if (data.price !== undefined) {
                price = `$${parseFloat(data.price).toFixed(2)}`;
            }
            if (data.compare_at_price && data.compare_at_price > data.price) {
                original_price = `$${parseFloat(data.compare_at_price).toFixed(2)}`;
            }

            // Extract image URL
            let image_url = data.image_url || null;
            if (image_url && !image_url.startsWith('http')) {
                image_url = `https:${image_url}`;
            }

            // Build product URL
            const handle = data.url || data.handle;
            const url = handle ? `https://shophouzz.com${handle.startsWith('/') ? '' : '/'}${handle}` : null;

            // Extract rating
            let rating = null;
            let review_count = null;
            if (data.reviews_average) {
                rating = parseFloat(data.reviews_average);
            }
            if (data.reviews_count) {
                review_count = parseInt(data.reviews_count, 10);
            }

            return {
                title: item.value || data.title || null,
                brand: data.vendor || data.manufacturer || null,
                price,
                original_price,
                image_url,
                rating,
                review_count,
                description: data.description || null,
                specifications: null,
                url,
                sku: data.sku || null,
                product_type: data.product_type || null,
                materials: data.materials || null,
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

                    // Optionally fetch additional details
                    if (collectDetails && product.url) {
                        const details = await fetchProductDetails(product.url);
                        product.description = details.description || product.description;
                        product.specifications = details.specifications;

                        // Add small delay to avoid overwhelming the server
                        await new Promise(r => setTimeout(r, 200));
                    }

                    batchBuffer.push(product);
                    saved++;
                    await pushBatch();
                }

                hasMorePages = currentPage < numPages;
                currentPage++;

                // Small delay between pages
                if (hasMorePages && saved < RESULTS_WANTED) {
                    await new Promise(r => setTimeout(r, 500));
                }
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
