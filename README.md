# Houzz Products Scraper

Extract comprehensive product data from Houzz including prices, ratings, descriptions, and specifications. Perfect for market research, price monitoring, and competitive analysis.

## Features

✅ **Fast & Reliable** - Optimized for speed with batch processing and smart pagination  
✅ **Complete Product Data** - Extract titles, brands, prices, ratings, reviews, images, and full descriptions  
✅ **Flexible Search** - Search by keywords or provide custom URLs  
✅ **Detail Page Support** - Optionally fetch complete product specifications and descriptions  
✅ **Anti-Blocking** - Built-in proxy support and stealth measures  
✅ **Production Ready** - Robust error handling and retry logic

## Use Cases

<h3>🛍️ E-commerce Intelligence</h3>

Monitor competitor pricing, track product availability, and analyze market trends across furniture and home decor categories.

<h3>📊 Market Research</h3>

Gather comprehensive product catalogs for analysis, identify popular brands, and understand customer preferences through ratings and reviews.

<h3>💰 Price Monitoring</h3>

Track price changes over time, identify sales and discounts, and optimize your pricing strategy based on market data.

<h3>🏠 Interior Design Research</h3>

Build databases of furniture and decor items, compare styles and prices, and help clients find the perfect pieces for their projects.

## Input Configuration

### Basic Configuration

<table>
<tr>
<th>Field</th>
<th>Type</th>
<th>Description</th>
<th>Required</th>
</tr>
<tr>
<td><strong>Search Query</strong></td>
<td>String</td>
<td>Product to search for (e.g., "sofa", "dining table", "outdoor furniture")</td>
<td>Yes</td>
</tr>
<tr>
<td><strong>Maximum Products</strong></td>
<td>Integer</td>
<td>Maximum number of products to collect (default: 20)</td>
<td>No</td>
</tr>
<tr>
<td><strong>Collect Full Details</strong></td>
<td>Boolean</td>
<td>Visit product pages for complete descriptions and specs (default: true)</td>
<td>No</td>
</tr>
</table>

### Advanced Configuration

<table>
<tr>
<th>Field</th>
<th>Type</th>
<th>Description</th>
<th>Default</th>
</tr>
<tr>
<td><strong>Maximum Pages</strong></td>
<td>Integer</td>
<td>Safety limit on search result pages to visit</td>
<td>20</td>
</tr>
<tr>
<td><strong>Proxy Configuration</strong></td>
<td>Object</td>
<td>Proxy settings (Residential proxies recommended)</td>
<td>Apify Residential</td>
</tr>
</table>

## Output Format

Each product in the dataset contains the following fields:

```json
{
  "title": "Modern 3-Seater Fabric Sofa with Accent Pillows",
  "brand": "Contemporary Living",
  "price": "$899.00",
  "original_price": "$1,299.00",
  "image_url": "https://shophouzz.com/images/product-123.jpg",
  "rating": 4.5,
  "review_count": 127,
  "description": "Elegant and comfortable 3-seater sofa featuring premium fabric upholstery...",
  "specifications": "Dimensions: 84W x 36D x 34H inches. Material: 100% polyester fabric...",
  "url": "https://shophouzz.com/products/modern-sofa-123"
}
```

### Field Descriptions

<table>
<tr>
<th>Field</th>
<th>Description</th>
</tr>
<tr>
<td><code>title</code></td>
<td>Product name</td>
</tr>
<tr>
<td><code>brand</code></td>
<td>Manufacturer or brand name</td>
</tr>
<tr>
<td><code>price</code></td>
<td>Current price (includes sale price if available)</td>
</tr>
<tr>
<td><code>original_price</code></td>
<td>Original price before discount (if applicable)</td>
</tr>
<tr>
<td><code>image_url</code></td>
<td>Main product image URL</td>
</tr>
<tr>
<td><code>rating</code></td>
<td>Average customer rating (1-5 scale)</td>
</tr>
<tr>
<td><code>review_count</code></td>
<td>Total number of customer reviews</td>
</tr>
<tr>
<td><code>description</code></td>
<td>Full product description (when Collect Full Details is enabled)</td>
</tr>
<tr>
<td><code>specifications</code></td>
<td>Product specifications and features (when Collect Full Details is enabled)</td>
</tr>
<tr>
<td><code>url</code></td>
<td>Direct link to product page</td>
</tr>
</table>

## Usage Examples

### Example 1: Search for Sofas

<strong>Input:</strong>

```json
{
  "query": "sofa",
  "results_wanted": 50,
  "collectDetails": true
}
```

<strong>Result:</strong> Extracts 50 sofa products with complete details including descriptions and specifications.

### Example 2: Quick Listing Extraction

<strong>Input:</strong>

```json
{
  "query": "dining table",
  "results_wanted": 100,
  "collectDetails": false
}
```

<strong>Result:</strong> Quickly extracts 100 dining table listings without visiting detail pages (faster execution).

### Example 3: Outdoor Furniture Research

<strong>Input:</strong>

```json
{
  "query": "outdoor patio furniture",
  "results_wanted": 200,
  "max_pages": 10,
  "collectDetails": true
}
```

<strong>Result:</strong> Scrapes up to 200 outdoor furniture products with full details and pagination control.

## Performance Tips

### Optimize Speed

<ul>
<li><strong>Disable Detail Fetching</strong> - Set <code>collectDetails</code> to <code>false</code> if you only need basic product information. This can reduce scraping time by 50-70%.</li>
<li><strong>Use Appropriate Limits</strong> - Set realistic <code>results_wanted</code> and <code>max_pages</code> values to avoid unnecessary requests.</li>
<li><strong>Residential Proxies</strong> - Use Apify Residential proxies for best performance and reliability.</li>
</ul>

### Avoid Blocking

<ul>
<li><strong>Enable Proxies</strong> - Always use proxy configuration when scraping large volumes.</li>
<li><strong>Reasonable Concurrency</strong> - The scraper uses optimized concurrency settings automatically.</li>
<li><strong>Respect Rate Limits</strong> - Avoid scraping thousands of products in a single run; split into multiple smaller runs if needed.</li>
</ul>

### Cost Optimization

<ul>
<li><strong>Start Small</strong> - Test with 10-20 products first to verify your configuration.</li>
<li><strong>Batch Processing</strong> - The scraper automatically batches data pushes to reduce overhead.</li>
<li><strong>Smart Pagination</strong> - Pagination stops automatically when the desired number of products is reached.</li>
</ul>

## Troubleshooting

### No Products Found

<strong>Issue:</strong> The scraper completes but returns zero products.

<strong>Solutions:</strong>
<ul>
<li>Verify your search query returns results on Houzz website</li>
<li>Ensure proxy configuration is enabled</li>
<li>Try a different search query</li>
</ul>

### Missing Fields

<strong>Issue:</strong> Some product fields are null or empty.

<strong>Solutions:</strong>
<ul>
<li>Enable <code>collectDetails</code> to fetch complete product information</li>
<li>Some products may not have all fields (e.g., ratings, reviews) - this is normal</li>
<li>Check the Houzz product page manually to verify data availability</li>
</ul>

### Slow Performance

<strong>Issue:</strong> Scraper takes longer than expected.

<strong>Solutions:</strong>
<ul>
<li>Disable <code>collectDetails</code> if full descriptions aren't needed</li>
<li>Reduce <code>results_wanted</code> for faster completion</li>
<li>Ensure you're using Apify Residential proxies</li>
</ul>

### Blocking or Errors

<strong>Issue:</strong> Scraper encounters 403 errors or timeouts.

<strong>Solutions:</strong>
<ul>
<li>Verify proxy configuration is properly set</li>
<li>Use Residential proxies instead of Datacenter proxies</li>
<li>Reduce scraping volume and run multiple smaller jobs</li>
</ul>

## Data Quality

All extracted data is validated and cleaned:

<ul>
<li><strong>Price Formatting</strong> - Prices are extracted in standard USD format ($X.XX)</li>
<li><strong>URL Validation</strong> - All URLs are absolute and properly formatted</li>
<li><strong>Deduplication</strong> - Duplicate products are automatically filtered</li>
<li><strong>Text Cleaning</strong> - Descriptions are cleaned of scripts, styles, and excess whitespace</li>
</ul>

## Limitations

<ul>
<li>The scraper extracts publicly available product data only</li>
<li>Some products may have limited information (ratings, reviews) depending on availability</li>
<li>Houzz may update their website structure; selectors are maintained for reliability</li>
<li>Large-scale scraping (10,000+ products) should be split into multiple runs</li>
</ul>

## Support

Need help or have questions?

<ul>
<li>Check the <strong>Troubleshooting</strong> section above</li>
<li>Review the <strong>Usage Examples</strong> for common scenarios</li>
<li>Contact support through the Apify platform</li>
</ul>

## Legal Notice

This scraper is provided for legitimate use cases such as market research, price monitoring, and competitive analysis. Users are responsible for ensuring their use complies with Houzz's Terms of Service and applicable laws. Always respect robots.txt and rate limits.

---

<p align="center">
<strong>Built with ❤️ for the Apify community</strong>
</p>