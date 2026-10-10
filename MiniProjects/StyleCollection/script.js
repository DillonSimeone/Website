document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('a.hub-card');

  cards.forEach(async (card) => {
    const href = card.getAttribute('href');
    if (!href || href === '#') return;

    // Get the folder path
    const folder = href.substring(0, href.indexOf('/'));
    if (!folder) return;

    try {
      // Fetch index.html to find and inject Google Font links
      fetch(`${folder}/index.html`)
        .then(res => {
          if (!res.ok) throw new Error();
          return res.text();
        })
        .then(htmlText => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');
          const fontLinks = doc.querySelectorAll('link[href*="fonts.googleapis.com"]');
          fontLinks.forEach(link => {
            if (!document.querySelector(`link[href="${link.href}"]`)) {
              const clonedLink = document.createElement('link');
              clonedLink.rel = 'stylesheet';
              clonedLink.href = link.href;
              document.head.appendChild(clonedLink);
            }
          });
        })
        .catch(() => {});

      // Fetch style.css to extract card variables
      const cssRes = await fetch(`${folder}/style.css`);
      if (!cssRes.ok) return;
      const cssText = await cssRes.text();

      // Parse :root variables
      const variables = {};
      const rootMatch = cssText.match(/(?::root|html)\s*\{([^}]+)\}/i);
      if (rootMatch) {
        const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
        let m;
        while ((m = varRegex.exec(rootMatch[1])) !== null) {
          variables[m[1].trim()] = m[2].trim();
        }
      }

      function resolveValue(val) {
        let resolved = val;
        const varUsageRegex = /var\((--[a-zA-Z0-9_-]+)\)/g;
        let m;
        while ((m = varUsageRegex.exec(resolved)) !== null) {
          const varName = m[1];
          const varVal = variables[varName] || '';
          resolved = resolved.replace(m[0], varVal);
        }
        return resolved;
      }

      // Extract styles from rules
      const ruleRegex = /([^{]+)\{([^}]+)\}/g;
      let match;
      
      let cardBg = '', cardColor = '', cardBorder = '', cardRadius = '', cardShadow = '', cardFont = '';
      let bodyBg = '', bodyColor = '', bodyFont = '';

      while ((match = ruleRegex.exec(cssText)) !== null) {
        const selectors = match[1].toLowerCase();
        const bodyContent = match[2];

        // Parse declarations inside this selector block
        const properties = {};
        const propRegex = /([a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
        let pMatch;
        while ((pMatch = propRegex.exec(bodyContent)) !== null) {
          properties[pMatch[1].trim()] = resolveValue(pMatch[2].trim());
        }

        if (selectors.includes('body')) {
          if (properties['background'] || properties['background-color']) {
            bodyBg = properties['background'] || properties['background-color'];
          }
          if (properties['color']) {
            bodyColor = properties['color'];
          }
          if (properties['font-family']) {
            bodyFont = properties['font-family'];
          }
        }

        // Match common card-like classes used in the showcases
        if (/(card|panel|sheet|pane|slab|inner|front|box|ticket|container)/i.test(selectors)) {
          if (properties['background'] || properties['background-color']) {
            cardBg = properties['background'] || properties['background-color'];
          }
          if (properties['color']) {
            cardColor = properties['color'];
          }
          if (properties['border']) {
            cardBorder = properties['border'];
          }
          if (properties['border-radius']) {
            cardRadius = properties['border-radius'];
          }
          if (properties['box-shadow']) {
            cardShadow = properties['box-shadow'];
          }
          if (properties['font-family']) {
            cardFont = properties['font-family'];
          }
        }
      }

      // Apply style variables to this card element
      const finalBg = cardBg || bodyBg;
      const finalColor = cardColor || bodyColor;
      const finalFont = cardFont || bodyFont;

      if (finalBg) card.style.setProperty('--theme-bg', finalBg);
      if (finalColor) card.style.setProperty('--theme-color', finalColor);
      if (cardBorder) card.style.setProperty('--theme-border', cardBorder);
      if (cardRadius) card.style.setProperty('--theme-radius', cardRadius);
      if (cardShadow) card.style.setProperty('--theme-shadow', cardShadow);
      if (finalFont) card.style.setProperty('--theme-font', finalFont);

    } catch (err) {
      console.error(`Failed to load styles for ${folder}:`, err);
    }
  });
});
