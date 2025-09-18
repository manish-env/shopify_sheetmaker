class ShopifyProductMapper {
    constructor() {
      this.productsData = [];
      this.existingShopifyData = [];
      this.mappingResults = null;
      this.columnMappings = {};
      this.currentStep = 1;
  
      // Image URL maps
      this.imageUrlMap = {};        // normalized filename -> URL
      this.imageUrlMapByBase = {};  // normalized base filename -> [URLs]
  
      this.finalResult = null;
  
      this.initializeEventListeners();
    }
  
    /* ============== INIT / EVENTS ============== */
    initializeEventListeners() {
      const productsFile = document.getElementById('products-file');
      const existingShopifyFile = document.getElementById('existing-shopify-file');
  
      const previewButton = document.getElementById('preview-mapping');
      const backToUploadButton = document.getElementById('back-to-upload');
      const proceedButton = document.getElementById('proceed-to-generate');
      const backToPreviewButton = document.getElementById('back-to-preview');
      const downloadButton = document.getElementById('download-shopify-csv');
  
      productsFile.addEventListener('change', (e) => this.handleProductsFile(e));
      existingShopifyFile.addEventListener('change', (e) => this.handleExistingShopifyFile(e));
  
      previewButton.addEventListener('click', () => this.previewMapping());
      backToUploadButton.addEventListener('click', () => this.goToStep(1));
      proceedButton.addEventListener('click', () => this.goToStep(3));
      backToPreviewButton.addEventListener('click', () => this.goToStep(2));
      downloadButton.addEventListener('click', () => this.downloadCSV());
  
      const autoMapButton = document.getElementById('auto-map-columns');
      const clearMappingsButton = document.getElementById('clear-mappings');
      if (autoMapButton) autoMapButton.addEventListener('click', () => this.autoDetectMappings());
      if (clearMappingsButton) clearMappingsButton.addEventListener('click', () => this.clearMappings());
  
      const imageUrlsFile = document.getElementById('image-urls-file');
      const imageUrlsText = document.getElementById('image-urls-text');
      if (imageUrlsFile) imageUrlsFile.addEventListener('change', (e) => this.handleImageUrlsFile(e));
      if (imageUrlsText) imageUrlsText.addEventListener('input', (e) => {
        this.handleImageUrlsText(e);
        if (this.currentStep === 2) {
          this.mappingResults = this.processMapping();
          this.displayPreview();
        } else if (this.currentStep === 3) {
          this.generateShopifySheet();
        }
      });
    }
  
    /* ============== FILE HANDLERS ============== */
    handleProductsFile(event) {
      const file = event.target.files[0];
      if (!file) return;
  
      const name = (file.name || '').toLowerCase();
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
      const isCsv = name.endsWith('.csv');
  
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (isExcel) {
            this.processProductsFile(e.target.result);
          } else if (isCsv) {
            this.processProductsCSV(e.target.result);
          } else {
            // Fallback attempt: try Excel first, then CSV
            try { this.processProductsFile(e.target.result); }
            catch { this.processProductsCSV(e.target.result); }
          }
        } catch (error) {
          console.error('Error processing products file:', error);
          alert('Error processing products file — please upload a valid CSV/XLSX.');
        }
      };
      if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    }
  
    handleExistingShopifyFile(event) {
      const file = event.target.files[0];
      if (!file) return;
  
      const name = (file.name || '').toLowerCase();
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
  
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (isExcel) {
            const data = e.target.result;
            const wb = XLSX.read(data, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            this.existingShopifyData = XLSX.utils.sheet_to_json(ws, { defval: '' });
          } else {
            const csvText = e.target.result;
            this.existingShopifyData = this.parseCSV(csvText);
          }
          console.log(`Loaded ${this.existingShopifyData.length} Shopify template rows`);
        } catch (error) {
          console.error('Error processing existing Shopify file:', error);
          alert('Error processing Shopify file. Upload a valid CSV/XLSX.');
        }
      };
      if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
    }
  
    processProductsFile(data) {
      try {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        this.productsData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        console.log(`Loaded ${this.productsData.length} products`);
      } catch (error) {
        console.error('Error processing products file:', error);
        alert('Error processing products file — is it a valid Excel?');
      }
    }
  
    processProductsCSV(text) {
      try {
        this.productsData = this.parseCSV(text);
        console.log(`Loaded ${this.productsData.length} products (CSV)`);
      } catch (error) {
        console.error('Error processing products CSV:', error);
        alert('Error processing products CSV — is it a valid CSV?');
      }
    }
  
    // CSV helper (for Shopify template if CSV)
    parseCSV(csvText) {
      const lines = csvText.split(/\r?\n/);
      if (!lines.length) return [];
      const headers = this.parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = this.parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => row[h] = (values[idx] || '').replace(/^"|"$/g, ''));
        rows.push(row);
      }
      return rows;
    }
  
    parseCSVLine(line) {
      const res = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          res.push(cur); cur = '';
        } else cur += ch;
      }
      res.push(cur);
      return res;
    }
  
    /* ============== IMAGE URL INGEST ============== */
    handleImageUrlsFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result || "";
        this.ingestImageUrlText(text);
        if (this.currentStep === 2) { this.mappingResults = this.processMapping(); this.displayPreview(); }
        if (this.currentStep === 3) { this.generateShopifySheet(); }
      };
      reader.readAsText(file);
    }
  
    handleImageUrlsText(e) {
      const text = e.target.value || "";
      this.ingestImageUrlText(text);
    }
  
    ingestImageUrlText(text) {
      this.imageUrlMap = {};
      this.imageUrlMapByBase = {};
      const lines = (text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const url of lines) {
        const fname = this.lastSegment(url);
        const key = this.normalizeFilename(fname);
        const baseKey = this.normalizeBaseKey(key);
        if (key) this.imageUrlMap[key] = url;
        if (!this.imageUrlMapByBase[baseKey]) this.imageUrlMapByBase[baseKey] = [];
        this.imageUrlMapByBase[baseKey].push(url);
      }
      // sort each base group by trailing index (…-1, …-2, …-3)
      for (const k of Object.keys(this.imageUrlMapByBase)) {
        this.imageUrlMapByBase[k].sort((a,b) => this.compareByTrailingIndex(this.lastSegment(a), this.lastSegment(b)));
      }
      console.log('Img URL groups:', Object.keys(this.imageUrlMapByBase).length);
    }
  
    /* ============== PREVIEW FLOW ============== */
    previewMapping() {
      if (!this.productsData.length) {
        alert('Upload a products file first.');
        return;
      }
      try {
        this.mappingResults = this.processMapping();
        this.displayPreview();
        this.goToStep(2);
      } catch (e) {
        console.error(e);
        alert('Preview error: ' + e.message);
      }
    }
  
    processMapping() {
      // Optional: map Shopify template rows by SKU (if provided)
      const existingMap = {};
      if (this.existingShopifyData.length) {
        this.existingShopifyData.forEach(row => {
          const sku = row.SKU || row['Variant SKU'] || '';
          if (!sku) return;
          if (!existingMap[sku]) existingMap[sku] = [];
          existingMap[sku].push(row);
        });
      }
  
      const processedProducts = [];
      let totalSizeVariants = 0;
  
      this.productsData.forEach(row => {
        const parsed = this.parseAttributes(row.attribute || "");
        const universalColor = this.normalizeColorToCSS(parsed.color || row.color || "");
        const normalizedFabric = this.normalizeFabric(parsed.fabric || row.fabric || "");
        // store normalized so getMappedValue can pick them
        row.universal_color = universalColor;
        row.normalized_fabric = normalizedFabric;
  
        const price = Number(row.price || 0);
        const sizes = this.extractSizes(row);
        totalSizeVariants += sizes.length;
  
        const sku = row.sku || row.SKU || row['Variant SKU'] || '';
        const existingVariants = existingMap[sku] || [];
  
        const resolvedImages = this.collectImagesForRow(row);
        if (Object.keys(this.imageUrlMap).length && Array.isArray(resolvedImages)) {
          row.images = resolvedImages.join(',');
        }
  
        processedProducts.push({
          ...row,
          parsed,
          universalColor,
          normalizedFabric,
          price,
          sizes,
          existingVariants,
          resolvedImages
        });
      });
  
      return {
        totalProducts: this.productsData.length,
        processedProducts,
        totalSizeVariants,
        hasExistingData: !!this.existingShopifyData.length
      };
    }
  
    displayPreview() {
      if (!this.mappingResults) return;
  
      document.getElementById('total-products').textContent = this.mappingResults.totalProducts;
      document.getElementById('mapped-columns').textContent = Object.keys(this.columnMappings).length;
      document.getElementById('size-variants').textContent = this.mappingResults.totalSizeVariants;
  
      this.displayColumnMapping();
      this.displayDataPreview();
    }
  
    displayDataPreview() {
      const tbody = document.getElementById('mapped-products-table');
      tbody.innerHTML = '';
  
      this.mappingResults.processedProducts.slice(0, 50).forEach(row => {
        const tr = document.createElement('tr');
  
        const sizes = row.sizes && row.sizes.length
          ? row.sizes.map(s => `<span class="tag">${s}</span>`).join('')
          : '<span class="muted">No sizes</span>';
  
        const categoryValue = this.getMappedValue(row, 'categories') || this.getMappedValue(row, 'category') || this.getMappedValue(row, 's_category');
        const { primary, subCategories } = this.splitCategories(categoryValue);
        const categoryDisplay = [primary, ...subCategories].filter(Boolean).join('<br/>');
  
        const imgs = Array.isArray(row.resolvedImages) ? row.resolvedImages : this.collectImagesForRow(row);
        const imgCount = imgs.length || 0;
        const first = imgs[0] || '';
        const firstName = first ? this.lastSegment(first) : '';
        const imgHtml = imgCount
          ? `<div><span class="pill">${imgCount} image(s)</span><br/><span class="muted mono" title="${first}">${firstName || first}</span></div>`
          : '<span class="muted">No images</span>';
  
        tr.innerHTML = `
          <td>${this.getMappedValue(row,'sku') || ''}</td>
          <td>${this.getMappedValue(row,'seo_title') || this.getMappedValue(row,'title') || this.getMappedValue(row,'product') || ''}</td>
          <td>${this.getMappedValue(row,'color') || row.parsed?.color || ''}</td>
          <td>${this.getMappedValue(row,'fabric') || row.parsed?.fabric || ''}</td>
          <td>${categoryDisplay}</td>
          <td class="sizes">${sizes}</td>
          <td>${imgHtml}</td>
          <td>${this.getMappedValue(row,'price') || ''}</td>
        `;
        tbody.appendChild(tr);
      });
  
      if (this.mappingResults.processedProducts.length > 50) {
        const info = document.createElement('tr');
        info.innerHTML = `<td colspan="8" class="muted" style="text-align:center;">Showing first 50. Total: ${this.mappingResults.processedProducts.length}.</td>`;
        tbody.appendChild(info);
      }
    }
  
    /* ============== GENERATE SHEET ============== */
    generateShopifySheet() {
      if (!this.mappingResults) {
        alert('Preview first.');
        return;
      }
      try {
        const result = this.generateShopifyData();
        this.displayFinalSummary(result);
      } catch (e) {
        console.error(e);
        alert('Generate error: ' + e.message);
      }
    }
  
    generateShopifyData() {
      const priceIncrease = Number(document.getElementById('price-increase').value) || 20;
      const sizePriceIncrease = Number(document.getElementById('size-price-increase').value) || 0;
      const productType = document.getElementById('product-type').value || 'Saree';
      const shopifyRows = [];
  
      if (!this.mappingResults || !this.mappingResults.processedProducts.length) {
        throw new Error('No processed products. Upload + Preview first.');
      }
      if (!this.columnMappings || !Object.keys(this.columnMappings).length) {
        // not mandatory, but warn
        console.warn('No explicit column mappings; relying on fallbacks.');
      }
  
      this.mappingResults.processedProducts.forEach((row, index) => {
        try {
          // Title & Handle rules
          const rawTitle = this.getMappedValue(row,'seo_title') || this.getMappedValue(row,'title') || this.getMappedValue(row,'product') || (row.sku || "");
          const title = String(rawTitle || "").trim();
          const handle = (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          // Per-row product type: prefer source, fallback to UI default
          const rowType = this.getMappedValue(row,'type') || productType;
  
          // Collect images but don't skip products without images
          const images = this.collectImagesForRow(row);
  
          const price = Number(this.getMappedValue(row,'price') || 0);
          const compareAt = isFinite(price) ? Number((price * (1 + priceIncrease/100)).toFixed(2)) : "";
  
          const sizes = row.sizes || [];
          const hasSizes = sizes.length > 0;
  
          if (hasSizes) {
            sizes.forEach((size, idx) => {
              const baseSku = this.getMappedValue(row,'sku') || "";
              const variantSku = baseSku + (size ? "-" + size : "");
              const sizePrice = this.calculateSizePrice(price, idx, sizePriceIncrease);
              const sizeCompareAt = isFinite(sizePrice) ? Number((sizePrice * (1 + priceIncrease/100)).toFixed(2)) : "";
  
              const base = {
                Handle: handle,
                Title: size ? `${title} - ${size}` : title,
                SKU: variantSku,
                "Body (HTML)": this.getMappedValue(row,'seo_body') || this.getMappedValue(row,'description') || "",
                Vendor: this.getMappedValue(row,'vendor') || "House of Sonalii",
                Type: rowType,
                Tags: this.generateTags(row),
                Published: "TRUE",
                "Option1 Name": "Size",
                "Option1 Value": size || "One Size",
                "Variant SKU": variantSku,
                "Variant Price": sizePrice || "",
                "Variant Compare At Price": sizeCompareAt || "",
                "Variant Inventory Qty": this.getMappedValue(row,'stock') || 0,
                "Variant Taxable": "TRUE",
                "Image Src": this.sanitizeImageUrl(images[0]) || "",
                "Image Position": images.length ? 1 : "",
                "Variant Image": this.sanitizeImageUrl(images[0]) || ""
              };
              this.addMetafields(base, row);
              shopifyRows.push(base);
            });
          } else {
            const sku = this.getMappedValue(row,'sku') || "";
            const base = {
              Handle: handle,
              Title: title,
              SKU: sku,
              "Body (HTML)": this.getMappedValue(row,'seo_body') || this.getMappedValue(row,'description') || "",
              Vendor: this.getMappedValue(row,'vendor') || "House of Sonalii",
              Type: rowType,
              Tags: this.generateTags(row),
              Published: "TRUE",
              "Option1 Name": "Title",
              "Option1 Value": "Default Title",
              "Variant SKU": sku,
              "Variant Price": price || "",
              "Variant Compare At Price": compareAt || "",
              "Variant Inventory Qty": this.getMappedValue(row,'stock') || 0,
              "Variant Taxable": "TRUE",
              "Image Src": this.sanitizeImageUrl(images[0]) || "",
              "Image Position": images.length ? 1 : "",
              "Variant Image": this.sanitizeImageUrl(images[0]) || ""
            };
            this.addMetafields(base, row);
            shopifyRows.push(base);
          }
  
          // Extra images (same handle)
          for (let i = 1; i < images.length; i++) {
            const extra = this.sanitizeImageUrl(images[i]);
            if (!extra) continue;
            shopifyRows.push({
              Handle: handle,
              "Image Src": extra,
              "Image Position": i + 1
            });
          }
  
        } catch (err) {
          console.error(`Row ${index} error:`, err);
        }
      });
  
      this.finalResult = {
        totalProducts: this.mappingResults.totalProducts,
        mappedProducts: shopifyRows.length,
        totalSizeVariants: this.mappingResults.totalSizeVariants,
        csvRows: shopifyRows.length,
        shopifyRows
      };
  
      return this.finalResult;
    }
  
    /* ============== IMAGE COLLECTION ============== */
    collectImagesForRow(row) {
      const raw = this.getMappedValue(row,'images') || this.getMappedValue(row,'image') || '';
      if (!raw) return [];
      const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
      const urlSet = new Set();
      for (const p of parts) {
        const fname = this.lastSegment(p);
        const key = this.normalizeFilename(fname);
        const baseKey = this.normalizeBaseKey(key);
        const exact = this.imageUrlMap[key];
        if (exact) { urlSet.add(exact); continue; }
        const group = this.imageUrlMapByBase[baseKey] || [];
        for (const u of group) urlSet.add(u);
      }
      const arr = Array.from(urlSet);
      // Updated (from provided list) first, then by trailing index
      arr.sort((a, b) => {
        const aMap = !!this.imageUrlMap[this.normalizeFilename(this.lastSegment(a))];
        const bMap = !!this.imageUrlMap[this.normalizeFilename(this.lastSegment(b))];
        if (aMap !== bMap) return aMap ? -1 : 1;
        return this.compareByTrailingIndex(this.lastSegment(a), this.lastSegment(b));
      });
      return arr;
    }
  
    /* ============== METAFIELDS / TAGS ============== */
    generateTags(row) {
      const tags = [];
      const color = this.getMappedValue(row,'color') || row.parsed?.color;
      if (color) tags.push(color);
      const fabric = this.getMappedValue(row,'fabric') || row.parsed?.fabric;
      if (fabric) tags.push(fabric);
      const occasion = this.getMappedValue(row,'occasion') || row.parsed?.occasion;
      if (occasion) tags.push(occasion);
      const work = this.getMappedValue(row,'work') || row.parsed?.work;
      if (work) tags.push(work);
      return tags.filter(Boolean).join(', ');
    }
  
    addMetafields(base, row) {
      const categoryValue = this.getMappedValue(row,'categories') || this.getMappedValue(row,'category') || this.getMappedValue(row,'s_category');
      if (categoryValue) {
        const { primary, subCategories } = this.splitCategories(categoryValue);
        base["Category (product.metafields.custom.s_category)"] = primary;
        base["Sub Categories (product.metafields.custom.sub_categories)"] = subCategories.join('\n');
      }
  
      const map = {
        "Color (product.metafields.custom.color)": ['color'],
        "Delivery time (product.metafields.custom.delivery_time)": ['delivery_time','delivered_in'],
        "Fabric (product.metafields.custom.fabric)": ['fabric'],
        "Occasion (product.metafields.custom.occasion)": ['occasion'],
        "Stitching (product.metafields.custom.stitching)": ['stitching'],
        "Universal Colors (product.metafields.custom.universal_colors)": ['universal_color'],
        "Universal Fabric (product.metafields.custom.universal_fabric)": ['normalized_fabric'],
        "Work (product.metafields.custom.work)": ['work'],
        "Chart ID (product.metafields.custom.chart_id)": ['chart_id','catalog_piece']
      };
  
      for (const [mf, fields] of Object.entries(map)) {
        let v = "";
        for (const f of fields) {
          v = this.getMappedValue(row, f);
          if (v) break;
        }
        // fallbacks from parsed attributes if direct fields empty
        if (!v) {
          if (mf.includes('.color')) v = row.parsed?.color || "";
          if (mf.includes('.fabric')) v = row.parsed?.fabric || "";
          if (mf.includes('.occasion')) v = row.parsed?.occasion || "";
          if (mf.includes('.work')) v = row.parsed?.work || "";
        }
        base[mf] = v || "";
      }
    }
  
    /* ============== UI: STEP 3 SUMMARY ============== */
    displayFinalSummary(result) {
      const tp = document.getElementById('final-total-products');
      if (tp) tp.textContent = result.totalProducts;
      const cr = document.getElementById('final-csv-rows');
      if (cr) cr.textContent = result.csvRows;
      const sv = document.getElementById('final-size-variants');
      if (sv) sv.textContent = result.totalSizeVariants || 0;
    }
  
    downloadCSV() {
      if (!this.finalResult) {
        alert('Generate the Shopify sheet first.');
        return;
      }
      const header = [
        "Handle","Title","SKU","Body (HTML)","Vendor","Type","Tags","Published",
        "Option1 Name","Option1 Value",
        "Variant SKU","Variant Price","Variant Compare At Price",
        "Variant Inventory Qty","Variant Taxable",
        "Image Src","Image Position","Variant Image",
        "Color (product.metafields.custom.color)",
        "Delivery time (product.metafields.custom.delivery_time)",
        "Fabric (product.metafields.custom.fabric)",
        "Occasion (product.metafields.custom.occasion)",
        "Stitching (product.metafields.custom.stitching)",
        "Category (product.metafields.custom.s_category)",
        "Sub Categories (product.metafields.custom.sub_categories)",
        "Universal Colors (product.metafields.custom.universal_colors)",
        "Universal Fabric (product.metafields.custom.universal_fabric)",
        "Work (product.metafields.custom.work)",
        "Chart ID (product.metafields.custom.chart_id)"
      ];
  
      const csvLines = [
        header.join(","),
        ...this.finalResult.shopifyRows.map(r =>
          header.map(h => (r[h] !== undefined ? `"${String(r[h]).replace(/"/g,'""')}"` : "")).join(",")
        )
      ];
  
      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = "shopify_products.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  
    /* ============== NAV / STEPS ============== */
    goToStep(step) {
      document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active','completed'));
      const content = document.getElementById(`step-${step}-content`);
      if (content) content.classList.remove('hidden');
      for (let i = 1; i <= step; i++) {
        const s = document.getElementById(`step-${i}`);
        if (!s) continue;
        if (i < step) s.classList.add('completed');
        if (i === step) s.classList.add('active');
      }
      this.currentStep = step;
      if (step === 3) this.generateShopifySheet();
    }
  
    /* ============== COLUMN MAPPING UI ============== */
    displayColumnMapping() {
      if (!this.productsData.length) return;
      const rowColumns = Object.keys(this.productsData[0] || {});
      const shopifyColumns = this.getShopifyColumns();
      this.displayColumnMappingWithDropdowns(rowColumns, shopifyColumns);
      if (!Object.keys(this.columnMappings).length) this.autoDetectMappings();
    }
  
    getShopifyColumns() {
      if (this.existingShopifyData.length) {
        return Object.keys(this.existingShopifyData[0] || {}).filter(h =>
          h !== 'Handle' && h !== 'Variant Compare At Price' && h !== 'Sub Categories (product.metafields.custom.sub_categories)'
        );
      }
      return [
        "Title","SKU","Body (HTML)","Vendor","Type","Tags","Published",
        "Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",
        "Variant SKU","Variant Price","Variant Inventory Qty","Variant Taxable",
        "Image Src","Image Position","Variant Image",
        "Color (product.metafields.custom.color)",
        "Delivery time (product.metafields.custom.delivery_time)",
        "Fabric (product.metafields.custom.fabric)",
        "Occasion (product.metafields.custom.occasion)",
        "Stitching (product.metafields.custom.stitching)",
        "Category (product.metafields.custom.s_category)",
        "Universal Colors (product.metafields.custom.universal_colors)",
        "Universal Fabric (product.metafields.custom.universal_fabric)",
        "Work (product.metafields.custom.work)",
        "Chart ID (product.metafields.custom.chart_id)"
      ];
    }
  
    displayColumnMappingWithDropdowns(rowColumns, shopifyColumns) {
      const shopifyContainer = document.getElementById('shopify-columns');
      const rowContainer = document.getElementById('row-sheet-columns');
      shopifyContainer.innerHTML = '';
      rowContainer.innerHTML = '';
  
      shopifyColumns.forEach(shopCol => {
        const wrap = document.createElement('div');
        wrap.className = 'mapping';
        const labelL = document.createElement('div');
        labelL.innerHTML = `<span class="mono">${shopCol}</span>`;
        const type = document.createElement('div');
        type.innerHTML = `<span class="pill">${this.getColumnType(shopCol)}</span>`;
        const dd = document.createElement('select');
        dd.className = 'mapping-dropdown';
        dd.dataset.shopifyColumn = shopCol;
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '-- Select Row Sheet Column --';
        dd.appendChild(empty);
        rowColumns.forEach(rc => {
          const opt = document.createElement('option');
          opt.value = rc; opt.textContent = rc;
          if (this.columnMappings[rc] === shopCol) opt.selected = true;
          dd.appendChild(opt);
        });
        dd.addEventListener('change', (e) => {
          const sc = e.target.dataset.shopifyColumn;
          const rc = e.target.value;
          // remove old mapping pointing to this Shopify column
          Object.keys(this.columnMappings).forEach(k => {
            if (this.columnMappings[k] === sc) delete this.columnMappings[k];
          });
          if (rc) this.columnMappings[rc] = sc;
          document.getElementById('mapped-columns').textContent = Object.keys(this.columnMappings).length;
          // refresh right pane mapping indicators
          this.displayColumnMappingWithDropdowns(rowColumns, shopifyColumns);
        });
  
        wrap.appendChild(labelL);
        wrap.appendChild(type);
        wrap.appendChild(dd);
        shopifyContainer.appendChild(wrap);
      });
  
      rowColumns.forEach(rc => {
        const row = document.createElement('div');
        row.className = 'mapping';
        row.innerHTML = `<div class="mono">${rc}</div><div></div><div>${this.columnMappings[rc] ? '<span class="pill">Mapped</span>' : ''}</div>`;
        rowContainer.appendChild(row);
      });
    }
  
    getColumnType(column) {
      const map = {
        'sku':'Text','title':'Text','price':'Number','color':'Text','fabric':'Text','size':'Text',
        'image':'URL','description':'Text','seo_body':'Text','seo_title':'Text','category':'Text','stock':'Number'
      };
      const l = column.toLowerCase();
      for (const [k,t] of Object.entries(map)) if (l.includes(k)) return t;
      return 'Text';
    }
  
    autoDetectMappings() {
      const rowColumns = Object.keys(this.productsData[0] || {});
      const shopifyColumns = this.getShopifyColumns();
  
      // Priority patterns (Shopify header → preferred source columns)
      const mappingPatterns = {
        'SKU': ['sku'],
        'Variant SKU': ['sku'],
        'Title': ['seo_title','title','product'],
        'Body (HTML)': ['seo_body','description','seo_description'],
        'Vendor': ['vendor'],
        'Type': ['product','type'],
        'Tags': ['seo_keyword','keyword','tags'],
  
        'Image Src': ['image','images'],
        'Variant Image': ['image','images'],
        'Option1 Value': ['size','sizes'],
        'Variant Inventory Qty': ['stock','inventory'],
        'Delivery time (product.metafields.custom.delivery_time)': ['delivery_time','delivered_in'],
        'Stitching (product.metafields.custom.stitching)': ['stitching'],
        'Category (product.metafields.custom.s_category)': ['categories','category','s_category'],
        'Chart ID (product.metafields.custom.chart_id)': ['chart_id','catalog_piece'],
        'Color (product.metafields.custom.color)': ['color'],
        'Universal Colors (product.metafields.custom.universal_colors)': ['universal_color','color'],
        'Fabric (product.metafields.custom.fabric)': ['fabric'],
        'Universal Fabric (product.metafields.custom.universal_fabric)': ['normalized_fabric','fabric'],
        'Occasion (product.metafields.custom.occasion)': ['occasion'],
        'Work (product.metafields.custom.work)': ['work']
      };
  
      this.columnMappings = {};
  
      const pickMatch = (needleArr) => {
        for (const needle of needleArr) {
          const hit = rowColumns.find(rc => rc.toLowerCase() === needle.toLowerCase())
                || rowColumns.find(rc => rc.toLowerCase().includes(needle.toLowerCase()));
          if (hit) return hit;
        }
        return '';
      };
  
      shopifyColumns.forEach(shopCol => {
        const candidates = mappingPatterns[shopCol];
        if (!candidates) return;
        const src = pickMatch(candidates);
        if (src) this.columnMappings[src] = shopCol;
      });
  
      this.displayColumnMappingWithDropdowns(rowColumns, shopifyColumns);
      document.getElementById('mapped-columns').textContent = Object.keys(this.columnMappings).length;
    }
  
    clearMappings() {
      this.columnMappings = {};
      const rowColumns = Object.keys(this.productsData[0] || {});
      const shopifyColumns = this.getShopifyColumns();
      this.displayColumnMappingWithDropdowns(rowColumns, shopifyColumns);
      document.getElementById('mapped-columns').textContent = '0';
    }
  
    /* ============== LOOKUPS & HELPERS ============== */
    getMappedValue(row, fieldName) {
      // Respect explicit columnMappings first
      try {
        for (const [rowColumn, shopCol] of Object.entries(this.columnMappings)) {
          if (!shopCol) continue;
          const lcShop = shopCol.toLowerCase();
          const lcField = String(fieldName || '').toLowerCase();
          if (lcShop.includes(lcField) || String(rowColumn).toLowerCase() === lcField || String(rowColumn).toLowerCase().includes(lcField)) {
            const v = row[rowColumn];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
          }
        }
        // Fallbacks: exact key, then contains
        const keys = Object.keys(row || {});
        const lowerField = String(fieldName || '').toLowerCase();
        const exact = keys.find(k => String(k).toLowerCase() === lowerField);
        if (exact) return row[exact] || '';
        const contains = keys.find(k => String(k).toLowerCase().includes(lowerField));
        if (contains) return row[contains] || '';
        return '';
      } catch {
        return '';
      }
    }
  
    extractSizes(row) {
      const sizeFields = ['sizes','size','Size','Sizes','variants','variant','Variants','Variant'];
      const sizes = [];
      for (const f of sizeFields) {
        if (row[f]) {
          const raw = row[f];
          if (typeof raw === 'string') {
            raw.split(/[,;|]/).forEach(s => { const t = s.trim(); if (t) sizes.push(t); });
          } else if (Array.isArray(raw)) {
            raw.forEach(s => { const t = String(s).trim(); if (t) sizes.push(t); });
          }
        }
      }
      if (!sizes.length && row.attribute) {
        // parse size from attributes if present
        String(row.attribute).split(';').forEach(part => {
          const [k,v] = part.split(':');
          if (k && v && k.trim().toLowerCase().includes('size')) {
            v.split(/[,;|]/).forEach(s => { const t = s.trim(); if (t) sizes.push(t); });
          }
        });
      }
      return [...new Set(sizes)];
    }
  
    splitCategories(categoryString) {
      try {
        if (!categoryString || typeof categoryString !== 'string') {
          return { primary:'', subCategories:[] };
        }
        const parts = categoryString.split(',').map(s => s.trim()).filter(Boolean);
        if (!parts.length) return { primary:'', subCategories:[] };
        return { primary: parts[0], subCategories: parts.slice(1) };
      } catch {
        return { primary:'', subCategories:[] };
      }
    }
  
    calculateSizePrice(basePrice, sizeIndex, sizePriceIncrease) {
      try {
        if (!sizePriceIncrease) return basePrice;
        const inc = (basePrice * sizePriceIncrease / 100) * sizeIndex;
        return Number((basePrice + inc).toFixed(2));
      } catch {
        return basePrice;
      }
    }
  
    // URL hygiene to avoid Shopify "invalid URL"
    sanitizeImageUrl(u) {
      const url = String(u || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r?\n/g, " ").trim();
      return /^https:\/\/[^\s"]+?\.(jpg|jpeg|png|gif|webp)(\?[^\s"]*)?$/i.test(url) ? url : "";
    }
  
    // filename tools
    lastSegment(p) {
      return String(p || "").split(/[?#]/)[0].split("/").pop() || "";
    }
  
    convertImageName(name) {
      return String(name || "").replace(/\((\d+)\)/g, "-$1");
    }
  
    normalizeFilename(s) {
      try { s = decodeURIComponent(s); } catch {}
      s = String(s || "").trim();
      s = this.convertImageName(s).replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
      return s;
    }
  
    // base key = no ext, minus trailing -a-1 / -1 patterns
    normalizeBaseKey(filename) {
      const stem = String(filename || '').replace(/\.[a-z0-9]+$/i, '');
      return stem.replace(/-(?:[a-z]+-)?\d+$/i, '');
    }
  
    compareByTrailingIndex(a, b) {
      const ai = this.extractTrailingIndex(a);
      const bi = this.extractTrailingIndex(b);
      if (ai !== null && bi !== null) return ai - bi;
      if (ai !== null) return -1;
      if (bi !== null) return 1;
      return String(a).localeCompare(String(b));
    }
  
    extractTrailingIndex(name) {
      const n = String(name || '').toLowerCase();
      const stem = n.replace(/\.[a-z0-9]+$/i, '');
      const m = stem.match(/-(?:[a-z]+-)?(\d+)$/i);
      return m ? parseInt(m[1], 10) : null;
    }
  
    // attributes: "color:...;fabric:...;occasion:...;work:..."
    parseAttributes(attr) {
      const acc = { color:'', fabric:'', occasion:'', work:'' };
      if (!attr || typeof attr !== 'string') return acc;
      const parts = attr.split(';').map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        const [kRaw, vRaw] = p.split(':', 2);
        const k = (kRaw || '').trim().toLowerCase();
        const v = (vRaw || '').trim();
        if (!k || !v) continue;
        if (k === 'color') acc.color = v;
        else if (k === 'fabric') acc.fabric = v;
        else if (k === 'occasion' || k === 'ocasion') acc.occasion = v;
        else if (k === 'work') acc.work = v;
      }
      return acc;
    }
  
    // normalize textile color (Rama→teal, etc.)
    normalizeColorToCSS(name) {
      if (!name) return "";
      let s = name.toLowerCase().trim()
        .replace(/burgandy/g, "burgundy")
        .replace(/voilet/g, "violet")
        .replace(/turquiose/g, "turquoise")
        .replace(/firoji/g, "firozi")
        .replace(/gajari/g, "gajri")
        .replace(/[\/&]/g, " ")
        .replace(/\s+/g, " ");
  
      const rules = [
        [["black","jet","carbon"], "black"],
        [["white","off white","off-white"], "white"],
        [["grey","gray","silver","steel","graphite","charcoal","ash"], "gray"],
        [["beige","cream","fawn","sand","camel","tan","khaki"], "beige"],
        [["brown","coffee","chocolate","mocha","cocoa"], "brown"],
        [["maroon","wine","oxblood","burgundy"], "maroon"],
        [["red","scarlet","crimson","brick","cherry"], "red"],
        [["orange","saffron","peach","apricot","coral","salmon","gajri"], "orange"],
        [["gold","golden"], "gold"],
        [["yellow","mustard","lemon"], "yellow"],
        [["olive","mehendi","mehndi"], "olive"],
        [["mint","pista","sage","pistachio","light green"], "lightgreen"],
        [["green","parrot","emerald","bottle green","forest"], "green"],
        [["teal","sea green","rama"], "teal"],
        [["turquoise","firozi","aqua","cyan"], "turquoise"],
        [["sky","sky blue","light blue","powder blue"], "skyblue"],
        [["blue","royal"], "blue"],
        [["navy","midnight blue"], "navy"],
        [["purple","violet","lavender","lilac"], "purple"],
        [["pink","rose","magenta","fuchsia","hot pink"], "fuchsia"],
      ];
  
      for (const [keys, target] of rules) {
        for (const kw of keys) if (s.includes(kw)) return target;
      }
      for (const t of s.split(" ")) {
        for (const [keys, target] of rules) if (keys.includes(t)) return target;
      }
      return "gray";
    }
  
    normalizeFabric(s) {
      if (!s) return "";
      const x = s.trim().toLowerCase().replace(/\s+/g, " ");
      if (x.includes("georgette")) return "Georgette";
      if (x.includes("silk")) return "Silk";
      if (x.includes("satin")) return "Satin";
      if (x.includes("net")) return "Net";
      if (x.includes("chinon")) return "Chinon";
      if (x.includes("chiffon")) return "Chiffon";
      if (x.includes("crepe")) return "Crepe";
      if (x.includes("cotton") || x.includes("viscose")) return "Cotton";
      if (x.includes("muslin")) return "Muslin";
      if (x.includes("organza")) return "Organza";
      if (x.includes("rayon")) return "Rayon";
      if (x.includes("taffeta")) return "Soft Taffeta";
      if (x.includes("jacquard")) return "Jacquard";
      if (x.includes("fancy") || x.includes("crush")) return "Fancy Crush";
      return "Other / Fashion";
    }
  }
  
  /* init */
  document.addEventListener('DOMContentLoaded', () => {
    new ShopifyProductMapper();
  });
  