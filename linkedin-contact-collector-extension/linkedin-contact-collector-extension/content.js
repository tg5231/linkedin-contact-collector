(function () {
  const MISSING = "未找到";
  const CONTACT_PATH = /\/overlay\/contact-info\/?$/i;
  const CONNECTIONS_PATH = /\/mynetwork\/invite-connect\/connections\/?/i;
  const PROFILE_PATH = /\/in\/[^/?#]+\/?$/i;
  const PROFILE_READY_DELAY_MS = 4000;
  const CONTACT_LINK_MAX_WAIT_MS = 8000;
  const CONTACT_MODAL_AFTER_CLICK_WAIT_MS = 3600;
  const CONTACT_REGION_MAX_WAIT_MS = 15000;
  const NEXT_PROFILE_DELAY_MS = 3500;
  const DEFAULT_BATCH_LIMIT = 10;
  const DEFAULT_REST_AFTER = 10;
  const DEFAULT_DELAY_SECONDS = 6;
  const DEFAULT_REST_MINUTES = 30;
  const DEFAULT_PROFILE_INFO_SECONDS = 4;
  const DEFAULT_AFTER_PROFILE_SECONDS = 3;
  let activeProfileRunKey = "";
  let activeCollectKey = "";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function htmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hasValue(value) {
    const text = clean(value);
    return Boolean(text && text !== MISSING);
  }

  function isValidCountry(value) {
    const text = clean(value);
    if (!text || text === MISSING) return false;
    if (/^(BIM|CAD|CEO|CTO|COO|CFO|CRM|GIS|IT|AI|BD|NDT)$/i.test(text)) return false;
    if (/manager|engineer|director|surveyor|sales|project|general|construction|technology|services/i.test(text)) return false;
    return text.length > 3 || /^(USA|UAE|UK)$/i.test(text);
  }

  function normalizeProfileUrl(url) {
    const match = String(url || location.href).match(/https:\/\/www\.linkedin\.com\/in\/[^/?#]+/i);
    return match ? match[0].replace(/\/?$/, "/") : "";
  }

  function toContactUrl(url) {
    const profile = normalizeProfileUrl(url);
    return profile ? profile.replace(/\/$/, "") + "/overlay/contact-info/" : "";
  }

  function toProfileUrl(url) {
    return normalizeProfileUrl(url);
  }

  function isLinkedInProfileUrl(url) {
    return /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?$/i.test(normalizeProfileUrl(url));
  }

  function profileName() {
    const title = clean(document.title).replace(/\s*\|\s*LinkedIn.*$/i, "");
    const h1 = clean(document.querySelector("h1")?.innerText || "");
    return h1 || title || MISSING;
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.innerText || document.querySelector(selector)?.textContent || "");
      if (value) return value;
    }
    return "";
  }

  function inferCountry(locationText) {
    const value = clean(locationText);
    if (!value || value === MISSING) return MISSING;
    const zhCountries = [
      ["法国", "France"],
      ["美国", "United States"],
      ["加拿大", "Canada"],
      ["中国", "China"],
      ["德国", "Germany"],
      ["英国", "United Kingdom"],
      ["意大利", "Italy"],
      ["西班牙", "Spain"],
      ["葡萄牙", "Portugal"],
      ["荷兰", "Netherlands"],
      ["比利时", "Belgium"],
      ["瑞士", "Switzerland"],
      ["澳大利亚", "Australia"],
      ["日本", "Japan"],
      ["印度", "India"],
      ["新加坡", "Singapore"],
      ["巴西", "Brazil"],
      ["墨西哥", "Mexico"],
      ["阿联酋", "United Arab Emirates"]
    ];
    for (const [zh, country] of zhCountries) {
      if (value.includes(zh)) return country;
    }
    const countryNames = [
      "France", "United States", "USA", "Canada", "China", "Chine", "Germany", "Deutschland", "United Kingdom", "UK",
      "Italy", "Spain", "Portugal", "Netherlands", "Belgium", "Switzerland", "Australia", "Japan", "India", "Singapore",
      "Brazil", "Mexico", "UAE", "United Arab Emirates"
    ];
    for (const country of countryNames) {
      if (new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value)) {
        if (/^(USA|United States)$/i.test(country)) return "United States";
        if (/^(UK|United Kingdom)$/i.test(country)) return "United Kingdom";
        if (/^Chine$/i.test(country)) return "China";
        return country;
      }
    }
    const cityMap = [
      [/Paris|Lyon|Toulouse|Marseille|Nantes|Bordeaux|Lille|Rennes|Grenoble|Montpellier|Annecy|Île-de-France|Ile-de-France|波尔多|安纳西/i, "France"],
      [/New York|San Francisco|Los Angeles|Chicago|Boston|Seattle|Texas|California|Florida|Washington DC/i, "United States"],
      [/Beijing|Shanghai|Shenzhen|Guangzhou|Hangzhou|Suzhou|Chengdu|Hong Kong/i, "China"],
      [/London|Manchester|Birmingham|Cambridge|Oxford/i, "United Kingdom"],
      [/Berlin|Munich|Hamburg|Frankfurt|Stuttgart/i, "Germany"],
      [/Milan|Rome|Torino|Turin/i, "Italy"],
      [/Madrid|Barcelona|Valencia|Gij[oó]n|Gijon|希洪/i, "Spain"],
      [/Amsterdam|Rotterdam|Utrecht/i, "Netherlands"],
      [/Brussels|Antwerp/i, "Belgium"],
      [/Geneva|Zurich|Lausanne/i, "Switzerland"],
      [/Toronto|Vancouver|Montreal|Ottawa/i, "Canada"],
      [/Singapore/i, "Singapore"]
    ];
    for (const [pattern, country] of cityMap) {
      if (pattern.test(value)) return country;
    }
    return MISSING;
  }

  function profileTopLines() {
    const h1 = document.querySelector("h1");
    const root = h1?.closest("section, main, .ph5, .pv-text-details__left-panel") || document.querySelector("main") || document.body;
    return String(root?.innerText || "")
      .split(/\n/)
      .map(clean)
      .filter(Boolean)
      .slice(0, 30);
  }

  function profileTopCardInfo() {
    const h1 = document.querySelector("h1");
    const root = h1?.closest("section, .ph5, .pv-text-details__left-panel") || h1?.parentElement;
    const lines = String(root?.innerText || "")
      .split(/\n/)
      .map(clean)
      .filter(Boolean)
      .filter((line) => !/^·?\s*\d+\s*度$/.test(line))
      .filter((line) => !/^(1st|2nd|3rd)$/i.test(line))
      .filter((line) => !/^500\+?\s*位好友|^\d+\s*位好友|共同好友|发消息|更多|Message|More$/i.test(line));
    const name = clean(h1?.innerText || "");
    const nameIndex = Math.max(0, lines.findIndex((line) => line.includes(name) || name.includes(line)));
    const afterName = lines.slice(nameIndex + 1);
    const headline = afterName.find((line) => !looksLikeProfileLocation(line) && !/联系|Contact|好友|followers/i.test(line)) || "";
    const location = afterName.find(looksLikeProfileLocation) || "";
    return { headline, location };
  }

  function looksLikeProfileLocation(line) {
    const value = cleanProfileLocation(line);
    if (!value || /联系|Contact|好友|followers|关注|发消息|Message|更多|More|共同好友/i.test(value)) return false;
    if (inferCountry(value) !== MISSING) return true;
    return /省|市|州|区|县|郡|地区|大区|Province|Region|Greater|Area|County|State/i.test(value);
  }

  function cleanProfileLocation(line) {
    return clean(String(line || "")
      .split(/[·•]/)[0]
      .replace(/\s*(联系方式|Contact info|Contact)\s*$/i, ""));
  }

  function inferCountryDetails(locationText) {
    const value = clean(locationText);
    if (!value || value === MISSING) {
      return { country: MISSING, source: "missing", confidence: "none" };
    }

    const explicitCountries = [
      [/法国|France|Chine\b/i, "France"],
      [/美国|United States|USA\b|U\.S\.A\.|États-Unis|Etats-Unis/i, "United States"],
      [/加拿大|Canada/i, "Canada"],
      [/中国|China|Chine/i, "China"],
      [/德国|Germany|Deutschland|Allemagne/i, "Germany"],
      [/英国|United Kingdom|UK\b|Royaume-Uni/i, "United Kingdom"],
      [/意大利|Italy|Italia|Italie/i, "Italy"],
      [/西班牙|Spain|España|Espagne/i, "Spain"],
      [/葡萄牙|Portugal/i, "Portugal"],
      [/荷兰|Netherlands|Nederland|Pays-Bas/i, "Netherlands"],
      [/比利时|Belgium|Belgique/i, "Belgium"],
      [/瑞士|Switzerland|Suisse|Schweiz/i, "Switzerland"],
      [/澳大利亚|Australia|Australie/i, "Australia"],
      [/日本|Japan|Japon/i, "Japan"],
      [/印度|India|Inde/i, "India"],
      [/新加坡|Singapore|Singapour/i, "Singapore"],
      [/巴西|Brazil|Brasil|Brésil|Bresil/i, "Brazil"],
      [/墨西哥|Mexico|México|Mexique/i, "Mexico"],
      [/阿联酋|UAE|United Arab Emirates|Émirats arabes unis|Emirats arabes unis/i, "United Arab Emirates"],
      [/罗马尼亚|Romania|Roumanie/i, "Romania"]
    ];
    for (const [pattern, country] of explicitCountries) {
      if (pattern.test(value)) return { country, source: "explicit_country", confidence: "high" };
    }

    const regionMap = [
      [/新阿基坦|Nouvelle-Aquitaine|Aquitaine|Bordeaux|La Rochelle|Limoges|Poitiers|Pau|Bayonne|波尔多/i, "France"],
      [/法兰西岛|Île-de-France|Ile-de-France|Paris|Versailles|Nanterre|Créteil|Creteil/i, "France"],
      [/奥弗涅|罗讷|Auvergne|Rhône-Alpes|Rhone-Alpes|Lyon|Grenoble|Clermont-Ferrand|Saint-Étienne|Saint-Etienne|Annecy|安纳西/i, "France"],
      [/普罗旺斯|蔚蓝海岸|Provence|Côte d'Azur|Cote d'Azur|Marseille|Nice|Toulon|Avignon|Aix-en-Provence/i, "France"],
      [/奥克西塔尼|Occitanie|Toulouse|Montpellier|Nîmes|Nimes|Perpignan/i, "France"],
      [/布列塔尼|Bretagne|Rennes|Brest|Quimper|Lorient/i, "France"],
      [/诺曼底|Normandie|Rouen|Caen|Le Havre/i, "France"],
      [/卢瓦尔|Pays de la Loire|Nantes|Angers|Le Mans/i, "France"],
      [/上法兰西|Hauts-de-France|Lille|Amiens|Dunkerque/i, "France"],
      [/大东部|Grand Est|Strasbourg|Nancy|Metz|Reims|Mulhouse/i, "France"],
      [/勃艮第|Bourgogne|Franche-Comté|Franche-Comte|Dijon|Besançon|Besancon/i, "France"],
      [/中央-卢瓦尔|Centre-Val de Loire|Tours|Orléans|Orleans/i, "France"],
      [/科西嘉|Corse|Corsica|Ajaccio|Bastia/i, "France"],
      [/California|Texas|Florida|New York|Washington|Illinois|Massachusetts|Boston|Seattle|Chicago|Los Angeles|San Francisco/i, "United States"],
      [/Ontario|Quebec|Québec|British Columbia|Alberta|Toronto|Vancouver|Montreal|Montréal|Ottawa|Calgary/i, "Canada"],
      [/Bavaria|Bayern|Berlin|Hamburg|Hesse|Hessen|Munich|München|Frankfurt|Stuttgart|Cologne|Köln/i, "Germany"],
      [/England|Scotland|Wales|London|Manchester|Birmingham|Cambridge|Oxford|Bristol/i, "United Kingdom"],
      [/Lombardy|Lombardia|Milan|Milano|Rome|Roma|Turin|Torino|Veneto|Bologna/i, "Italy"],
      [/Catalonia|Cataluña|Catalunya|Madrid|Barcelona|Valencia|Seville|Sevilla|Gij[oó]n|Gijon|马德里|马德里自治区|巴塞罗那|加泰罗尼亚|瓦伦西亚|塞维利亚|安达卢西亚|希洪/i, "Spain"],
      [/North Holland|South Holland|Amsterdam|Rotterdam|Utrecht|Eindhoven/i, "Netherlands"],
      [/Flanders|Wallonia|Brussels|Bruxelles|Antwerp|Anvers|Ghent|Gent/i, "Belgium"],
      [/Geneva|Genève|Zurich|Zürich|Lausanne|Basel|Bern/i, "Switzerland"],
      [/Beijing|Shanghai|Shenzhen|Guangzhou|Hangzhou|Suzhou|Chengdu|Hong Kong|香港/i, "China"],
      [/Bangkok|Chiang Mai|Phuket|Chonburi|Pathum Thani|Samut Prakan|Nonthaburi|ประเทศไทย|กรุงเทพ|泰国/i, "Thailand"],
      [/Kuala Lumpur|Selangor|Penang|Johor|Melaka|Sabah|Sarawak|Malaysia|马来西亚/i, "Malaysia"],
      [/Jakarta|Surabaya|Bandung|Bali|Indonesia|印尼|印度尼西亚/i, "Indonesia"],
      [/Hanoi|Ho Chi Minh|Da Nang|Vietnam|Việt Nam|越南/i, "Vietnam"],
      [/Manila|Cebu|Philippines|菲律宾/i, "Philippines"],
      [/Seoul|Busan|Incheon|Korea|South Korea|韩国/i, "South Korea"],
      [/Tokyo|Osaka|Nagoya|Yokohama|Japan|日本/i, "Japan"],
      [/Dubai|Abu Dhabi|Sharjah|UAE|阿联酋/i, "United Arab Emirates"],
      [/Riyadh|Jeddah|Dammam|Saudi Arabia|沙特/i, "Saudi Arabia"],
      [/Istanbul|Ankara|Izmir|Türkiye|Turkey|土耳其/i, "Turkey"],
      [/Lisbon|Porto|Braga|Portugal|葡萄牙/i, "Portugal"],
      [/Stockholm|Gothenburg|Malmö|Malmo|Sweden|瑞典/i, "Sweden"],
      [/Oslo|Bergen|Norway|挪威/i, "Norway"],
      [/Copenhagen|Aarhus|Denmark|丹麦/i, "Denmark"],
      [/Helsinki|Finland|芬兰/i, "Finland"],
      [/Warsaw|Krakow|Kraków|Poland|波兰/i, "Poland"],
      [/Prague|Czech|Czechia|捷克/i, "Czechia"],
      [/Vienna|Austria|奥地利/i, "Austria"],
      [/Bucharest|București|Bucuresti|Romania|罗马尼亚|布加勒斯特/i, "Romania"]
    ];
    for (const [pattern, country] of regionMap) {
      if (pattern.test(value)) return { country, source: "ai_region_guess", confidence: "medium" };
    }

    return { country: MISSING, source: "unmatched_region", confidence: "none" };
  }

  function inferCountry(locationText) {
    return inferCountryDetails(locationText).country;
  }

  function extractLabeledValue(text, labels) {
    const lines = String(text || "").split(/\n/).map(clean).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      if (labels.some((label) => new RegExp(`^${label}\\s*[:：]?$`, "i").test(lines[i]))) {
        return lines[i + 1] || "";
      }
      for (const label of labels) {
        const match = lines[i].match(new RegExp(`${label}\\s*[:：]\\s*(.+)$`, "i"));
        if (match) return clean(match[1]);
      }
    }
    return "";
  }

  function relevantProfileText(headline, queueItem = {}) {
    return clean([
      headline,
      queueItem.title,
      queueItem.headline
    ].filter(Boolean).join(" | "));
  }

  function profileRightPanelLines() {
    const companyLinkLines = Array.from(document.querySelectorAll('a[href*="/company/"], a[href*="/school/"]'))
      .flatMap((a) => String(a.innerText || a.textContent || a.getAttribute("aria-label") || "")
        .split(/\n/)
        .map(clean)
        .filter(Boolean));
    const selectors = [
      ".pv-text-details__right-panel",
      ".pv-top-card--experience-list",
      ".pv-top-card-v2-ctas + div",
      "[data-view-name='profile-component-entity']"
    ];
    const allLines = [...companyLinkLines];
    for (const selector of selectors) {
      const roots = Array.from(document.querySelectorAll(selector));
      for (const root of roots) {
      const lines = String(root?.innerText || root?.textContent || "")
        .split(/\n/)
        .map(clean)
        .filter(Boolean)
        .filter((line) => !/通知|Add to|关注|发消息|联系|Contact|好友|folk/i.test(line));
        allLines.push(...lines);
      }
    }
    return Array.from(new Set(allLines)).slice(0, 20);
  }

  function looksLikeCompanyName(line) {
    const value = clean(line);
    if (!value || value.length < 2 || value.length > 90) return false;
    if (/学校|大学|学院|University|College|Institut\b|Institute\b|École|Ecole|发消息|关注|通知|Contact|联系|好友/i.test(value)) return false;
    if (/^\d+/.test(value) || /^[·•]/.test(value)) return false;
    if (/Business Development|Manager|Sales|Engineer|Director|Founder|顾问|经理|工程师|负责人/i.test(value)) return false;
    return /Ltd|Limited|Inc|LLC|GmbH|SAS|SA\b|BV\b|AG\b|Group|Systems|Technologies|Solutions|Industries|Geosystems|Hexagon|Corporation|Company|Co\.|公司|集团|科技/i.test(value) || value.split(/\s+/).length >= 2;
  }

  function extractPositionTitle(headline, queueItem = {}) {
    const value = clean(headline || queueItem.headline || queueItem.title || "");
    if (!value) return MISSING;
    return clean(value.split(/\s*[|/｜]\s*/)[0]) || value;
  }

  function extractCompanyName(headline, queueItem = {}) {
    if (hasValue(queueItem.company)) return queueItem.company;
    const rightPanelCompany = profileRightPanelLines().find(looksLikeCompanyName) || "";
    if (rightPanelCompany) return rightPanelCompany;
    const value = clean(headline || queueItem.title || queueItem.headline || "");
    if (!value) return MISSING;
    const patterns = [
      /(?:^|\s)@\s*([^|,·•\n]+)/i,
      /\bat\s+([^|,·•\n]+)/i,
      /\bchez\s+([^|,·•\n]+)/i,
      /\bpresso\s+([^|,·•\n]+)/i
    ];
    for (const pattern of patterns) {
      const match = value.match(pattern);
      const company = clean(match?.[1] || "");
      if (company && company.length <= 80) return company;
    }
    return MISSING;
  }

  function classifyIndustry(text) {
    const value = clean(text);
    if (!value) return { industry: MISSING, raw: "", source: "none", confidence: "none" };
    const rules = [
      {
        industry: "Industrial Metrology / 3D Measurement",
        patterns: [/metrology|metrolog[ií]a|m[eé]trologie|CMM|CALYPSO|ZEISS|FARO|3D\s*(scan|scanning|measurement|metrology)|dimensional control|control dimensional|topograf/i]
      },
      {
        industry: "Surveying / Geospatial",
        patterns: [/survey|surveyor|topograph|topograf|géomètre|geometra|geospatial|LiDAR|cartograph|photogrammetry|GIS|mapping/i]
      },
      {
        industry: "Drone / UAV Services",
        patterns: [/drone|UAV|pilote de drone|aerial inspection|photogrammetry|thermograph/i]
      },
      {
        industry: "Robotics / Physical AI",
        patterns: [/robotics|robotique|physical AI|spatial intelligence|automation|automatisation/i]
      },
      {
        industry: "Industrial Automation",
        patterns: [/automation|automatización|automatisation|PLC|SCADA|industrial control|OT network|red OT/i]
      },
      {
        industry: "Logistics / Supply Chain",
        patterns: [/logistics|supply chain|freight|shipping|e-commerce logistics|door-to-door|Amazon SPN/i]
      },
      {
        industry: "Manufacturing / Industrial Equipment",
        patterns: [/manufacturing|fabrication|industrial equipment|machine tool|CNC|factory|production|engineering equipment/i]
      },
      {
        industry: "Quality Control / NDT",
        patterns: [/quality control|contr[oô]le qualit|nondestructive|non-destructive|NDT|inspection|industrial CT|tomography/i]
      },
      {
        industry: "Packaging",
        patterns: [/packaging|emballage|membrane|seal|thread|bottle|container/i]
      },
      {
        industry: "Software / IT Services",
        patterns: [/software|SaaS|IT services|cloud|data|AI|machine learning|developer|cybersecurity|CRM/i]
      },
      {
        industry: "Sales / Business Development",
        patterns: [/sales|business development|account manager|inside sales|BD\b|B2B|customer care|ventas/i]
      }
    ];
    const matches = [];
    for (const rule of rules) {
      let score = 0;
      const evidence = [];
      for (const pattern of rule.patterns) {
        const match = value.match(pattern);
        if (match) {
          score += 1;
          evidence.push(match[0]);
        }
      }
      if (score) matches.push({ ...rule, score, evidence });
    }
    matches.sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (!best) {
      return { industry: MISSING, raw: value.slice(0, 300), source: "keyword_classifier", confidence: "none" };
    }
    return {
      industry: best.industry,
      raw: best.evidence.slice(0, 6).join("; "),
      source: "keyword_classifier",
      confidence: best.score >= 2 ? "high" : "medium"
    };
  }

  function profileMeta(queueItem = {}) {
    const topCard = profileTopCardInfo();
    const headline = topCard.headline || firstText([
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      "section .text-body-medium"
    ]);
    const cssLocation = firstText([
      ".pv-text-details__left-panel span.text-body-small.inline.t-black--light.break-words",
      ".ph5 span.text-body-small.inline.t-black--light.break-words",
      ".text-body-small.inline.t-black--light.break-words",
      ".pv-text-details__left-panel .text-body-small",
      "section .text-body-small"
    ]);
    const topLocation = topCard.location || profileTopLines().find(looksLikeProfileLocation) || "";
    const location = cleanProfileLocation(topLocation || cssLocation);
    const explicitIndustry = queueItem.industry && queueItem.industry !== MISSING ? queueItem.industry : "";
    const classifiedIndustry = classifyIndustry(relevantProfileText(headline, queueItem));
    const industry = explicitIndustry || queueItem.industry || classifiedIndustry.industry || MISSING;
    const countryDetails = inferCountryDetails(location || queueItem.location || "");
    const country = isValidCountry(queueItem.country) ? queueItem.country : countryDetails.country;
    return {
      title: extractPositionTitle(headline, queueItem),
      headline: headline || queueItem.headline || MISSING,
      company: extractCompanyName(headline, queueItem),
      location: location || queueItem.location || MISSING,
      country,
      country_source: isValidCountry(queueItem.country) ? (queueItem.country_source || "queue") : countryDetails.source,
      country_confidence: isValidCountry(queueItem.country) ? (queueItem.country_confidence || "existing") : countryDetails.confidence,
      industry,
      industry_raw: explicitIndustry || classifiedIndustry.raw || "",
      industry_source: explicitIndustry ? "linkedin_profile_field" : classifiedIndustry.source,
      industry_confidence: explicitIndustry ? "high" : classifiedIndustry.confidence
    };
  }

  async function rememberProfileMeta(queue, index, queueItem) {
    const meta = profileMeta(queueItem);
    const nextItem = { ...queueItem, ...meta };
    if (Array.isArray(queue) && queue.length && queue[index]) {
      const nextQueue = queue.slice();
      nextQueue[index] = nextItem;
      await storageSet({ queue: nextQueue });
    }
    return nextItem;
  }

  function linkData(root) {
    return Array.from(root.querySelectorAll("a[href]")).map((a) => ({
      text: clean(a.innerText || a.textContent || ""),
      href: String(a.getAttribute("href") || a.href || "")
    }));
  }

  function scoreRoot(el) {
    const text = clean(el.innerText || el.textContent || "");
    const cls = String(el.className || "");
    const links = linkData(el);
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
    let score = 0;

    if (el.getAttribute("role") === "dialog") score += 80;
    if (/modal|artdeco-modal/i.test(cls)) score += 60;
    if (/pv-contact-info|contact-info/i.test(cls)) score += 80;
    if (/联系方式|联系信息|Contact info|Contact|Coordonnées|Coordonnees/i.test(text)) score += 50;
    if (/电子邮件|邮箱|Email|E-mail|电话|Phone|Téléphone|Telephone|网站|Website|Site web|个人资料|Profile/i.test(text)) score += 50;
    if (/联系方式/i.test(text) && /邮箱|Email|E-mail/i.test(text)) score += 120;
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) score += 70;
    if (links.some((l) => /^mailto:/i.test(l.href))) score += 80;
    if (CONTACT_PATH.test(location.pathname)) score += 25;
    if (rect.width > 250 && rect.height > 120 && rect.width < window.innerWidth * 0.96 && rect.height < window.innerHeight * 0.9) score += 30;

    if (/动态|评论|转发|feed\/update|推荐|共同好友|显示全部动态|activity|comment|reaction|recommendation/i.test(text)) score -= 80;
    if (text.length > 4000) score -= 120;
    if (text.length < 20) score -= 20;

    return { el, text, links, score };
  }

  function bestContactRegion() {
    return Array.from(document.querySelectorAll('[role="dialog"],.artdeco-modal,.pv-contact-info,[class*="contact-info"],section,div'))
      .filter((el) => {
        const text = clean(el.innerText || el.textContent || "");
        if (!text) return false;
        if (el === document.body || el === document.documentElement) return false;
        return /联系方式|联系信息|Contact info|Contact|Coordonnées|Coordonnees|邮箱|Email|E-mail|电话|Phone|网站|Website|linkedin\.com\/in\//i.test(text);
      })
      .map(scoreRoot)
      .filter((x) => x.score > 35)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.text.length - b.text.length))[0] || null;
  }

  function extractFields(region) {
    const text = region ? region.text : "";
    const links = region ? region.links : [];

    const mailtoEmails = links
      .filter((l) => /^mailto:/i.test(l.href))
      .map((l) => l.href.replace(/^mailto:/i, "").split("?")[0])
      .map(clean)
      .filter(Boolean);
    const textEmails = Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((m) => m[0]);
    const emails = Array.from(new Set([...mailtoEmails, ...textEmails]));

    const phoneLines = text
      .split(/\n| {2,}/)
      .map(clean)
      .filter((line) => /电话|Phone|Téléphone|Telephone/i.test(line) || /(?:\+|00)\d[\d\s().-]{6,}\d/.test(line));
    const phones = Array.from(
      new Set(
        phoneLines
          .flatMap((line) => Array.from(line.matchAll(/(?:\+|00)?\d[\d\s().-]{6,}\d/g)).map((m) => clean(m[0])))
          .filter((phone) => !/^202\d/.test(phone))
      )
    );

    const textUrls = Array.from(text.matchAll(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi))
      .map((m) => clean(m[0]).replace(/[),.;]+$/, ""))
      .map((url) => (/^www\./i.test(url) ? `https://${url}` : url));
    const websites = Array.from(
      new Set(
        [
          ...links
          .filter((l) => !/^mailto:/i.test(l.href))
          .filter((l) => !/linkedin\.com/i.test(l.href))
          .map((l) => l.href),
          ...textUrls.filter((url) => !/linkedin\.com/i.test(url))
        ]
      )
    );

    const locationMatch = text.match(/(?:地址|Address|所在地|Location)\s*[:：]?\s*([^\n]+)/i);

    return {
      email: emails[0] || MISSING,
      emails: emails.join("; ") || MISSING,
      email_count: emails.length,
      phone: phones[0] || MISSING,
      phones: phones.join("; ") || MISSING,
      phone_count: phones.length,
      website: websites[0] || MISSING,
      websites: websites.join("; ") || MISSING,
      website_count: websites.length,
      location: locationMatch ? clean(locationMatch[1]) : MISSING,
      raw_text: text.slice(0, 1200)
    };
  }

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(value) {
    return new Promise((resolve) => chrome.storage.local.set(value, resolve));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function todayDateString() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatSavedUpdateTime(value) {
    if (!value) return "从未更新";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleString();
  }

  function clearFloatingPanels() {
    [
      "__codex_li_profile_panel",
      "__codex_li_auto_panel",
      "__codex_li_log_panel",
      "__codex_li_results_panel"
    ].forEach((id) => document.getElementById(id)?.remove());
  }

  function closeRunLogPanel() {
    document.getElementById("__codex_li_log_panel")?.remove();
  }

  async function stopAllTasks() {
    await storageSet({
      running: false,
      collecting: false,
      queue: [],
      index: 0,
      batchLimit: 0,
      restUntil: 0
    });
    clearFloatingPanels();
    await closeContactInfoView();
  }

  function resultValue(row, keys) {
    for (const key of keys) {
      const value = clean(row?.[key]);
      if (value && value !== MISSING) return value;
    }
    return "";
  }

  function resultCountry(row) {
    const country = resultValue(row, ["country"]);
    if (isValidCountry(country)) return country;
    const inferred = inferCountryDetails(resultValue(row, ["profile_location", "location"])).country;
    return inferred && inferred !== MISSING ? inferred : "";
  }

  function resultRegion(row) {
    let region = resultValue(row, ["profile_location", "location"]);
    const country = resultCountry(row);
    const aliases = {
      France: ["France", "法国"],
      Spain: ["Spain", "España", "Espagne", "西班牙"],
      Romania: ["Romania", "România", "Roumanie", "罗马尼亚"],
      "United Kingdom": ["United Kingdom", "UK", "英国"],
      "United States": ["United States", "USA", "美国"],
      Germany: ["Germany", "Deutschland", "德国"],
      Italy: ["Italy", "Italia", "意大利"],
      China: ["China", "中国"]
    };
    for (const alias of aliases[country] || [country]) {
      if (!alias) continue;
      region = region.replace(new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,，/\\-·|]*\\s*`, "i"), "");
    }
    return clean(region);
  }

  async function renderResultsPanel() {
    document.getElementById("__codex_li_results_panel")?.remove();
    const { results = [] } = await storageGet(["results"]);
    const rows = results.slice().reverse();
    const emailCount = results.filter((row) => resultValue(row, ["emails", "email"])).length;
    const phoneCount = results.filter((row) => resultValue(row, ["phones", "phone"])).length;
    const panel = document.createElement("div");
    panel.id = "__codex_li_results_panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:min(980px,calc(100vw - 32px));max-height:78vh;overflow:auto;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
    const body = rows.slice(0, 80).map((row) => `
      <tr>
        <td>${htmlEscape(resultValue(row, ["company", "company_name", "current_company"]))}</td>
        <td>${htmlEscape(resultValue(row, ["name"]))}</td>
        <td>${htmlEscape(resultCountry(row))}</td>
        <td>${htmlEscape(resultRegion(row))}</td>
        <td>${htmlEscape(resultValue(row, ["emails", "email"]))}</td>
        <td>${htmlEscape(resultValue(row, ["phones", "phone"]))}</td>
        <td>${htmlEscape(resultValue(row, ["industry"]))}</td>
        <td>${htmlEscape(resultValue(row, ["status"]))}</td>
      </tr>
    `).join("");
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div>
          <div style="font-weight:700;">已采集数据</div>
          <div style="color:#555;">总数：${results.length}；有邮箱：${emailCount}；有电话：${phoneCount}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button id="__codex_li_results_refresh">刷新</button>
          <button id="__codex_li_results_close">关闭</button>
        </div>
      </div>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead>
          <tr>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">公司名</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">姓名</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">国家</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">地区</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">邮箱</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">电话</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">行业</th>
            <th style="border:1px solid #d1d5db;background:#1f4e79;color:#fff;padding:6px;text-align:left;">状态</th>
          </tr>
        </thead>
        <tbody>${body || `<tr><td colspan="8" style="border:1px solid #d1d5db;padding:10px;color:#666;">暂无已采集数据。</td></tr>`}</tbody>
      </table>
      ${rows.length > 80 ? `<div style="margin-top:8px;color:#555;">这里只显示最近 80 条，完整数据请从插件弹窗导出。</div>` : ""}
    `;
    document.body.appendChild(panel);
    panel.querySelector("#__codex_li_results_close").addEventListener("click", () => panel.remove());
    panel.querySelector("#__codex_li_results_refresh").addEventListener("click", renderResultsPanel);
  }

  function renderPersistentResultsButton() {
    if (document.getElementById("__codex_li_persistent_results")) return;
    const button = document.createElement("button");
    button.id = "__codex_li_persistent_results";
    button.textContent = "查看数据";
    button.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:18px;background:#fff;color:#0a66c2;border:1px solid #0a66c2;border-radius:6px;padding:8px 10px;font:13px Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);";
    button.addEventListener("click", renderResultsPanel);
    document.body.appendChild(button);
  }

  async function closeContactInfoView() {
    const closeButton = Array.from(document.querySelectorAll("button, [role='button']"))
      .find((el) => {
        const text = clean(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
        return /关闭|Close|Dismiss|取消|Cancel/i.test(text);
      });
    if (closeButton) {
      await clickLikeUser(closeButton);
      await sleep(600);
      return true;
    }
    if (CONTACT_PATH.test(location.pathname)) {
      const profile = toProfileUrl(location.href);
      if (profile) {
        history.replaceState(null, "", profile);
        window.dispatchEvent(new PopStateEvent("popstate"));
        await sleep(400);
        return true;
      }
    }
    return false;
  }

  async function waitForContactRegion() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < CONTACT_REGION_MAX_WAIT_MS) {
      const region = bestContactRegion();
      if (region) return region;
      await sleep(500);
    }
    return null;
  }

  function findContactLink() {
    const exactLinks = Array.from(document.querySelectorAll('a[href*="/overlay/contact-info/"]'))
      .filter((el) => {
        const href = absoluteLinkedInHref(el.href || el.getAttribute("href") || "");
        return /\/overlay\/contact-info\/?$/i.test(href);
      });
    if (exactLinks.length) {
      return exactLinks
        .map((el) => ({
          el,
          top: el.getBoundingClientRect ? el.getBoundingClientRect().top : 999999,
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
        }))
        .sort((a, b) => (b.visible - a.visible) || a.top - b.top)[0].el;
    }

    const links = Array.from(document.querySelectorAll('button, [role="button"]'));
    const scored = links.map((el) => {
      const text = clean(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
      const href = String(el.href || el.getAttribute("href") || "");
      let score = 0;
      if (/\/overlay\/contact-info\/?$/i.test(href)) score += 140;
      if (/联系方式|联系信息|Contact info|Contact|Coordonnées|Coordonnees/i.test(text)) score += 100;
      if (/发送|发消息|Message|关注|Follow|更多|More|通知/i.test(text)) score -= 50;
      return { el, text, href, score };
    }).filter((item) => item.score > 70).sort((a, b) => b.score - a.score);
    return scored[0]?.el || null;
  }

  function contactLinkDiagnostics() {
    return Array.from(document.querySelectorAll('a[href*="/overlay/contact-info/"], button, [role="button"]'))
      .map((el) => ({
        text: clean(el.innerText || el.textContent || el.getAttribute("aria-label") || ""),
        href: String(el.href || el.getAttribute("href") || ""),
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      }))
      .filter((item) => /contact-info|联系方式|联系信息|Contact|Coordonnées|Coordonnees/i.test(item.text + " " + item.href))
      .slice(0, 10);
  }

  function absoluteLinkedInHref(href) {
    if (!href) return "";
    try {
      return new URL(href, location.origin).href;
    } catch {
      return "";
    }
  }

  async function clickLikeUser(el) {
    el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(250);
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
    const rect = el.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: Math.max(1, Math.floor(rect.left + rect.width / 2)),
      clientY: Math.max(1, Math.floor(rect.top + rect.height / 2))
    };
    for (const type of ["pointerover", "pointerenter", "pointermove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventCtor = type.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new EventCtor(type, eventInit));
    }
    if (typeof el.click === "function") el.click();
  }

  async function waitForModalAfterClick(timeoutMs) {
    const clickedAt = Date.now();
    while (Date.now() - clickedAt < timeoutMs) {
      if (bestContactRegion()) return true;
      if (CONTACT_PATH.test(location.pathname)) return true;
      await sleep(250);
    }
    return false;
  }

  async function openContactModalFromProfile() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < CONTACT_LINK_MAX_WAIT_MS) {
      const link = findContactLink();
      if (link) {
        const href = absoluteLinkedInHref(link.href || link.getAttribute("href") || "");
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          renderLogPanel("LinkedIn Contact Collector", [
            `Contact button found.`,
            `Click attempt: ${attempt}/3`,
            href || "No href on button yet."
          ]);
          await clickLikeUser(link);
          if (await waitForModalAfterClick(CONTACT_MODAL_AFTER_CLICK_WAIT_MS)) {
            return { ok: true, navigated: false, method: `click_attempt_${attempt}` };
          }
          await sleep(500);
        }
        if (href && /\/overlay\/contact-info\/?$/i.test(href)) {
          location.href = href;
          return { ok: true, navigated: true, method: "click_then_href", href };
        }
        return { ok: true, navigated: false, method: "click" };
      }
      await sleep(250);
    }
    const fallbackHref = toContactUrl(location.href);
    if (fallbackHref) {
      location.href = fallbackHref;
      return { ok: true, navigated: true, method: "direct_contact_url", href: fallbackHref };
    }
    return { ok: false, navigated: false, method: "not_found" };
  }

  async function collectCurrentContact(queue, index, queueItem) {
    const { runId = "" } = await storageGet(["runId"]);
    const profileForKey = normalizeProfileUrl(queueItem.profile_url || location.href);
    const collectKey = `${runId || "manual"}:${index}:${profileForKey}`;
    if (activeCollectKey === collectKey) return;
    activeCollectKey = collectKey;
    const region = await waitForContactRegion();
    const fields = extractFields(region);
    const meta = profileMeta(queueItem);
    const profile = normalizeProfileUrl(location.href);
    const row = {
      name: profileName(),
      profile_url: profile,
      contact_info_url: toContactUrl(profile),
      ...fields,
      title: meta.title,
      headline: meta.headline,
      company: meta.company,
      profile_location: meta.location,
      location: fields.location && fields.location !== MISSING ? fields.location : meta.location,
      country: meta.country,
      country_source: meta.country_source,
      country_confidence: meta.country_confidence,
      industry: meta.industry,
      industry_raw: meta.industry_raw,
      industry_source: meta.industry_source,
      industry_confidence: meta.industry_confidence,
      connection_date: queueItem.connection_date || "",
      connection_date_text: queueItem.connection_date_text || "",
      run_id: runId || "",
      collected_at: new Date().toISOString(),
      status: region ? "OK" : "CONTACT_REGION_NOT_FOUND",
      source_scope: region ? "contact_info_region" : "none",
      captured_at: new Date().toISOString()
    };
    await saveResult(row);
    closeRunLogPanel();
    showBadge(row, queue.length || 1, index || 0);
    await goNextIfEnabled(index);
  }

  function renderProfilePanel() {
    document.getElementById("__codex_li_profile_panel")?.remove();
    const diagnostics = contactLinkDiagnostics();
    const panel = document.createElement("div");
    panel.id = "__codex_li_profile_panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:390px;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">LinkedIn Contact Collector</div>
      <div style="margin-bottom:8px;">个人主页已识别，正在自动采集。</div>
      <div style="margin-bottom:8px;">联系方式候选：${diagnostics.length} 个</div>
      <button id="__codex_li_profile_close">关闭</button>
      <pre style="white-space:pre-wrap;background:#f3f6f8;padding:8px;border-radius:6px;max-height:180px;overflow:auto;margin-top:8px;">${JSON.stringify(diagnostics, null, 2)}</pre>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#__codex_li_profile_close").addEventListener("click", () => panel.remove());
  }

  async function saveFailureAndContinue(queue, index, queueItem, status, details) {
    const currentProfile = normalizeProfileUrl(location.href);
    const meta = profileMeta(queueItem);
    const row = {
      name: profileName(),
      profile_url: currentProfile,
      contact_info_url: toContactUrl(currentProfile),
      email: MISSING,
      emails: MISSING,
      email_count: 0,
      phone: MISSING,
      phones: MISSING,
      phone_count: 0,
      website: MISSING,
      websites: MISSING,
      website_count: 0,
      title: meta.title,
      headline: meta.headline,
      company: meta.company,
      profile_location: meta.location,
      location: meta.location,
      country: meta.country,
      country_source: meta.country_source,
      country_confidence: meta.country_confidence,
      industry: meta.industry,
      industry_raw: meta.industry_raw,
      industry_source: meta.industry_source,
      industry_confidence: meta.industry_confidence,
      raw_text: "",
      connection_date: queueItem.connection_date || "",
      connection_date_text: queueItem.connection_date_text || "",
      run_id: (await storageGet(["runId"])).runId || "",
      collected_at: new Date().toISOString(),
      status,
      source_scope: "none",
      captured_at: new Date().toISOString()
    };
    await saveResult(row);
    renderLogPanel("LinkedIn Contact Collector", [
      `Failed: ${status}`,
      details || "",
      `Saved result for: ${row.name}`,
      "Continuing in 6 seconds..."
    ]);
    await sleep(6000);
    await goNextIfEnabled(index);
  }

  async function autoClickAndCollect(queue, index, queueItem) {
    const { profileInfoMs = DEFAULT_PROFILE_INFO_SECONDS * 1000, afterProfileMs = DEFAULT_AFTER_PROFILE_SECONDS * 1000 } = await storageGet(["profileInfoMs", "afterProfileMs"]);
    renderLogPanel("LinkedIn Contact Collector", [
      `Processing ${index + 1}/${queue.length || 1}`,
      `Name: ${profileName()}`,
      `Profile: ${normalizeProfileUrl(location.href)}`,
      "第 1 步：先读取主页可见资料。",
      `等待 ${(Number(profileInfoMs) / 1000).toFixed(1)} 秒，让主页信息加载完整...`
    ]);
    await sleep(Number(profileInfoMs) || PROFILE_READY_DELAY_MS);
    queueItem = await rememberProfileMeta(queue, index, queueItem);

    const savedMeta = profileMeta(queueItem);
    renderLogPanel("LinkedIn Contact Collector", [
      `Processing ${index + 1}/${queue.length || 1}`,
      "主页资料已缓存。",
      `职位/简介：${savedMeta.title || MISSING}`,
      `国家：${savedMeta.country || MISSING}`,
      `地区：${savedMeta.location || MISSING}`,
      `行业：${savedMeta.industry || MISSING}${savedMeta.industry_confidence ? `（${savedMeta.industry_confidence}）` : ""}`,
      "第 2 步：准备点击联系方式采集邮箱、电话、网站。",
      `再等待 ${(Number(afterProfileMs) / 1000).toFixed(1)} 秒...`
    ]);
    await sleep(Number(afterProfileMs) || 0);

    const diagnostics = contactLinkDiagnostics();
    renderLogPanel("LinkedIn Contact Collector", [
      `Processing ${index + 1}/${queue.length || 1}`,
      `Name: ${profileName()}`,
      `Profile: ${normalizeProfileUrl(location.href)}`,
      `Contact link candidates: ${diagnostics.length}`,
      diagnostics.length ? JSON.stringify(diagnostics.slice(0, 5), null, 2) : "No candidates yet.",
      "Trying to click Contact info automatically..."
    ]);

    const opened = await openContactModalFromProfile();
    if (!opened.ok) {
      await saveFailureAndContinue(queue, index, queueItem, "CONTACT_LINK_NOT_FOUND", "Could not find a clickable Contact info link.");
      return;
    }

    if (opened.navigated) {
      renderLogPanel("LinkedIn Contact Collector", [
        `Opened Contact info URL for: ${profileName()}`,
        opened.href || "",
        "Waiting for LinkedIn to load the contact page..."
      ]);
      return;
    }

    renderLogPanel("LinkedIn Contact Collector", [
      `Opened Contact info for: ${profileName()}`,
      `Method: ${opened.method || "click"}`,
      "Waiting for contact modal and extracting fields..."
    ]);
    await sleep(CONTACT_MODAL_AFTER_CLICK_WAIT_MS);
    await collectCurrentContact(queue, index, queueItem);
  }

  function showBadge(row, total, index) {
    document.getElementById("__codex_li_auto_panel")?.remove();
    const panel = document.createElement("div");
    panel.id = "__codex_li_auto_panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:360px;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">LinkedIn Contact Collector</div>
      <div>进度：${Math.min(index + 1, total)} / ${total}</div>
      <div>状态：${row.status}</div>
      <div>姓名：${row.name}</div>
      <div>职位：${row.title || row.headline || MISSING}</div>
      <div>国家：${row.country || MISSING}${row.country_confidence ? `（${row.country_confidence}${row.country_source ? ` / ${row.country_source}` : ""}）` : ""}</div>
      <div>地区：${row.profile_location || row.location || MISSING}</div>
      <div>行业：${row.industry || MISSING}${row.industry_confidence ? `（${row.industry_confidence}）` : ""}</div>
      <div>邮箱：${row.emails || row.email || MISSING}</div>
      <div>电话：${row.phones || row.phone || MISSING}</div>
      <div>网站：${row.websites || row.website || MISSING}</div>
      <div style="margin-top:8px;color:#555;">即将继续下一位。可在插件弹窗暂停。</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button id="__codex_li_auto_close">关闭</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector("#__codex_li_auto_close").addEventListener("click", () => panel.remove());
  }

  function renderLogPanel(title, lines) {
    let panel = document.getElementById("__codex_li_log_panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "__codex_li_log_panel";
      panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:420px;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">${title}</div>
      <pre style="white-space:pre-wrap;background:#f3f6f8;padding:8px;border-radius:6px;max-height:280px;overflow:auto;margin:0;">${lines.map(clean).join("\n")}</pre>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button id="__codex_li_log_pause">停止所有任务</button>
        <button id="__codex_li_log_close">关闭</button>
      </div>
    `;
    panel.querySelector("#__codex_li_log_pause").addEventListener("click", stopAllTasks);
    panel.querySelector("#__codex_li_log_close").addEventListener("click", () => panel.remove());
  }

  function renderCompletionPanel(total) {
    document.getElementById("__codex_li_auto_panel")?.remove();
    renderLogPanel("LinkedIn Contact Collector", [
      "Batch finished.",
      `Total queued: ${total}`,
      "You can export CSV from the extension popup."
    ]);
  }

  function renderRestPanel(done, total) {
    document.getElementById("__codex_li_auto_panel")?.remove();
    renderLogPanel("LinkedIn Contact Collector", [
      "建议休息一下。",
      `已连续采集：${done} / ${total}`,
      "为了降低触发风控的概率，已自动暂停。",
      "建议休息 10-30 分钟后，再从插件弹窗点击“继续”。"
    ]);
  }

  function boundedNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  function renderCompletionNotice(total, restMinutes = DEFAULT_REST_MINUTES) {
    document.getElementById("__codex_li_auto_panel")?.remove();
    renderLogPanel("LinkedIn Contact Collector", [
      "本批次已完成。",
      `本批次人数：${total}`,
      `建议休息：${restMinutes} 分钟后再继续。`,
      "可以从插件弹窗导出 CSV。"
    ]);
    setTimeout(closeRunLogPanel, 10000);
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function continueAfterRest() {
    const { queue = [], index = 0 } = await storageGet(["queue", "index"]);
    if (!queue.length || index >= queue.length) {
      renderCompletionNotice(queue.length || 0, DEFAULT_REST_MINUTES);
      return;
    }
    await storageSet({ running: true, restUntil: 0 });
    document.getElementById("__codex_li_rest_timer_panel")?.remove();
    location.href = toProfileUrl(queue[index].profile_url || queue[index]);
  }

  function renderRestTimer(done, total, restMinutes = DEFAULT_REST_MINUTES, restUntil = Date.now() + restMinutes * 60000) {
    document.getElementById("__codex_li_auto_panel")?.remove();
    document.getElementById("__codex_li_log_panel")?.remove();
    document.getElementById("__codex_li_rest_timer_panel")?.remove();
    const panel = document.createElement("div");
    panel.id = "__codex_li_rest_timer_panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:360px;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">休息计时器</div>
      <div>已连续采集：${done} / ${total}</div>
      <div style="margin-top:6px;color:#555;">建议休息后再继续，降低触发风控的概率。</div>
      <div id="__codex_li_rest_countdown" style="font-size:28px;font-weight:700;margin:10px 0;color:#0a66c2;">--:--</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="__codex_li_rest_continue">立即开始下一批</button>
        <button id="__codex_li_rest_stop">停止所有任务</button>
        <button id="__codex_li_rest_close">关闭</button>
      </div>
    `;
    document.body.appendChild(panel);
    const update = () => {
      const countdown = panel.querySelector("#__codex_li_rest_countdown");
      if (!countdown) return;
      countdown.textContent = formatCountdown(Number(restUntil) - Date.now());
    };
    update();
    const timer = setInterval(() => {
      if (!document.body.contains(panel)) {
        clearInterval(timer);
        return;
      }
      update();
    }, 1000);
    panel.querySelector("#__codex_li_rest_continue").addEventListener("click", continueAfterRest);
    panel.querySelector("#__codex_li_rest_stop").addEventListener("click", stopAllTasks);
    panel.querySelector("#__codex_li_rest_close").addEventListener("click", () => {
      clearInterval(timer);
      panel.remove();
    });
  }

  function renderRestNotice(done, total, restMinutes = DEFAULT_REST_MINUTES) {
    renderRestTimer(done, total, restMinutes);
  }

  function extractCardHeadline(cardText, linkText) {
    const name = clean(linkText);
    const lines = String(cardText || "").split(/\n/).map(clean).filter(Boolean);
    return lines.find((line) =>
      line &&
      line !== name &&
      !/^[·•]?\s*\d+\s*度$/.test(line) &&
      !/^(1st|2nd|3rd)$/i.test(line) &&
      !/^(发消息|加为好友|关注|Message|Connect|Follow|显示全部)$/i.test(line) &&
      !/成为好友|followers|位关注者|共同好友/i.test(line)
    ) || "";
  }

  function collectVisibleProfileUrls(existing, skipProfiles = new Set()) {
    const seen = new Set(existing.map((item) => item.profile_url || item));
    const items = [...existing];
    const cutoff = document.getElementById("__codex_li_since_date")?.value || "";
    for (const a of Array.from(document.querySelectorAll('a[href*="/in/"]'))) {
      const href = normalizeProfileUrl(a.href || a.getAttribute("href"));
      if (!href || !isLinkedInProfileUrl(href) || seen.has(href) || skipProfiles.has(href)) continue;
      const cardText = clean((a.closest("li, .artdeco-list__item, .mn-connection-card, div") || a).innerText || "");
      if (/加为好友|关注|推荐|你可能认识|People you may know/i.test(cardText)) continue;
      const connectionDate = extractConnectionDate(cardText);
      const headline = extractCardHeadline(cardText, a.innerText || a.textContent || "");
      if (cutoff && (!connectionDate.iso || connectionDate.iso < cutoff)) continue;
      seen.add(href);
      items.push({
        profile_url: href,
        title: headline,
        headline,
        connection_date_text: connectionDate.text || "",
        connection_date: connectionDate.iso || ""
      });
    }
    return items;
  }

  function extractConnectionDate(text) {
    const raw = clean(text);
    const zh = raw.match(/(?:于|成为好友|添加好友|连接于)?\s*(\d{4})年(\d{1,2})月(\d{1,2})日(?:成为好友|添加好友|连接)?/);
    if (zh) {
      const y = zh[1];
      const m = zh[2].padStart(2, "0");
      const d = zh[3].padStart(2, "0");
      return { text: `${y}年${Number(m)}月${Number(d)}日`, iso: `${y}-${m}-${d}` };
    }
    const zhShort = raw.match(/(?:于|成为好友|添加好友|连接于)?\s*(\d{4})年(\d{1,2})月(?:成为好友|添加好友|连接)?/);
    if (zhShort) {
      const y = zhShort[1];
      const m = zhShort[2].padStart(2, "0");
      return { text: `${y}年${Number(m)}月`, iso: `${y}-${m}-01` };
    }
    const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { text: iso[0], iso: `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}` };
    const slash = raw.match(/(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
    if (slash) return { text: slash[0], iso: `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}` };
    return { text: "", iso: "" };
  }

  async function applySavedSettingsToPanel() {
    const settings = await storageGet(["savedBatchLimit", "savedDelaySeconds", "savedProfileInfoSeconds", "savedAfterProfileSeconds", "savedRestAfter", "savedRestMinutes", "savedSkipCollected", "savedIncrementalMode", "lastIncrementalUpdateDate", "lastIncrementalUpdateAt"]);
    const map = {
      "__codex_li_batch_limit": settings.savedBatchLimit,
      "__codex_li_delay_seconds": settings.savedDelaySeconds,
      "__codex_li_profile_info_seconds": settings.savedProfileInfoSeconds,
      "__codex_li_after_profile_seconds": settings.savedAfterProfileSeconds,
      "__codex_li_rest_after": settings.savedRestAfter,
      "__codex_li_rest_minutes": settings.savedRestMinutes
    };
    for (const [id, value] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null && value !== "") el.value = String(value);
    }
    const skipEl = document.getElementById("__codex_li_skip_collected");
    if (skipEl) skipEl.checked = settings.savedSkipCollected !== "0";
    const incrementalEl = document.getElementById("__codex_li_incremental_mode");
    if (incrementalEl) incrementalEl.checked = settings.savedIncrementalMode !== "0";
    const sinceEl = document.getElementById("__codex_li_since_date");
    if (incrementalEl?.checked && sinceEl && !sinceEl.value && settings.lastIncrementalUpdateDate) sinceEl.value = settings.lastIncrementalUpdateDate;
    const lastEl = document.getElementById("__codex_li_last_update");
    if (lastEl) lastEl.textContent = `上次更新：${formatSavedUpdateTime(settings.lastIncrementalUpdateAt || settings.lastIncrementalUpdateDate)}`;
  }

  function saveSettingsFromPanel() {
    storageSet({
      savedBatchLimit: document.getElementById("__codex_li_batch_limit")?.value || DEFAULT_BATCH_LIMIT,
      savedDelaySeconds: document.getElementById("__codex_li_delay_seconds")?.value || DEFAULT_DELAY_SECONDS,
      savedProfileInfoSeconds: document.getElementById("__codex_li_profile_info_seconds")?.value || DEFAULT_PROFILE_INFO_SECONDS,
      savedAfterProfileSeconds: document.getElementById("__codex_li_after_profile_seconds")?.value || DEFAULT_AFTER_PROFILE_SECONDS,
      savedRestAfter: document.getElementById("__codex_li_rest_after")?.value || DEFAULT_REST_AFTER,
      savedRestMinutes: document.getElementById("__codex_li_rest_minutes")?.value || DEFAULT_REST_MINUTES,
      savedSkipCollected: document.getElementById("__codex_li_skip_collected")?.checked ? "1" : "0",
      savedIncrementalMode: document.getElementById("__codex_li_incremental_mode")?.checked ? "1" : "0"
    });
  }

  function scrollableListContainers() {
    const nodes = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector("main"),
      ...Array.from(document.querySelectorAll("main, section, div"))
    ];
    return Array.from(new Set(nodes.filter((el) => {
      if (!el) return false;
      if (el === document.body || el === document.documentElement || el === document.scrollingElement) return true;
      const style = window.getComputedStyle(el);
      return /(auto|scroll)/i.test(style.overflowY || "") && el.scrollHeight > el.clientHeight + 160;
    })));
  }

  function clickListLoadMoreButton() {
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    const btn = buttons.find((el) => {
      const text = clean(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
      return /^(显示更多|加载更多|查看更多|Show more|See more|Load more)$/i.test(text);
    });
    if (!btn) return false;
    try {
      btn.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function scrollConnectionsListPage() {
    const amount = Math.max(900, Math.floor(window.innerHeight * 0.95));
    let moved = false;
    const beforeY = window.scrollY;
    window.scrollBy(0, amount);
    moved = moved || window.scrollY !== beforeY;

    for (const el of scrollableListContainers()) {
      const before = el.scrollTop || 0;
      const max = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
      if (max > before) {
        el.scrollTop = Math.min(max, before + amount);
      }
      moved = moved || (el.scrollTop || 0) !== before;
    }
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    return moved;
  }

  function renderConnectionsPanel() {
    if (document.getElementById("__codex_li_connections_panel")) return;
    document.getElementById("__codex_li_launcher")?.remove();
    const panel = document.createElement("div");
    panel.id = "__codex_li_connections_panel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:16px;top:80px;width:380px;background:#fff;color:#111;border:1px solid #0a66c2;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:8px;font:13px/1.45 Arial,sans-serif;padding:12px";
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">LinkedIn Contact Collector</div>
      <div id="__codex_li_connections_status" style="margin-bottom:8px;">在人脉列表页准备就绪。</div>
      <label style="display:block;margin-bottom:8px;">只采集此日期之后添加的好友（可选）<br>
        <input id="__codex_li_since_date" type="date" style="width:100%;box-sizing:border-box;margin-top:4px;">
      </label>
      <label style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;">
        <input id="__codex_li_incremental_mode" type="checkbox" checked style="margin-top:3px;">
        <span>增量更新：只更新上次采集后新添加的好友</span>
      </label>
      <div id="__codex_li_last_update" style="margin:-2px 0 8px 24px;color:#555;">上次更新：从未更新</div>
      <label style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;">
        <input id="__codex_li_skip_collected" type="checkbox" checked style="margin-top:3px;">
        <span>跳过已采集客户，用于继续采集下一批</span>
      </label>
      <label style="display:block;margin-bottom:8px;">本次最多采集人数<br>
        <select id="__codex_li_batch_limit" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="5">5 个（更稳）</option>
          <option value="10" selected>10 个（推荐）</option>
          <option value="20">20 个</option>
          <option value="30">30 个（风险较高）</option>
          <option value="50">50 个（不建议频繁使用）</option>
          <option value="75">75 个（高风险）</option>
          <option value="100">100 个（不建议）</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;">每个人之间停顿<br>
        <select id="__codex_li_delay_seconds" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="4">4 秒</option>
          <option value="6" selected>6 秒（推荐）</option>
          <option value="10">10 秒（更稳）</option>
          <option value="15">15 秒</option>
          <option value="20">20 秒</option>
          <option value="30">30 秒（更接近人工）</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;">主页加载后先读取资料，停留多久<br>
        <select id="__codex_li_profile_info_seconds" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="3">3 秒</option>
          <option value="4" selected>4 秒（推荐）</option>
          <option value="6">6 秒（更稳）</option>
          <option value="8">8 秒</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;">读取主页资料后，再等多久点联系方式<br>
        <select id="__codex_li_after_profile_seconds" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="1">1 秒</option>
          <option value="2">2 秒</option>
          <option value="3" selected>3 秒（推荐）</option>
          <option value="5">5 秒（更稳）</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;">连续采集到多少人后自动停下休息<br>
        <select id="__codex_li_rest_after" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="5">5 个</option>
          <option value="10" selected>10 个（推荐）</option>
          <option value="20">20 个</option>
          <option value="30">30 个</option>
          <option value="50">50 个</option>
          <option value="0">不自动休息（风险较高）</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;">批次结束后建议休息多久<br>
        <select id="__codex_li_rest_minutes" style="width:100%;box-sizing:border-box;margin-top:4px;">
          <option value="15">15 分钟</option>
          <option value="30" selected>30 分钟</option>
          <option value="60">60 分钟（推荐给 50 人批次）</option>
          <option value="90">90 分钟</option>
          <option value="120">120 分钟</option>
        </select>
      </label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="__codex_li_start_from_list">从当前好友列表开始整理</button>
        <button id="__codex_li_view_results">查看已采集数据</button>
        <button id="__codex_li_stop_list">停止所有任务</button>
      </div>
      <div style="margin-top:8px;color:#555;">建议低速分批采集。若连续采集过多，LinkedIn 可能触发验证或限制。</div>
    `;
    document.body.appendChild(panel);
    applySavedSettingsToPanel();
    panel.querySelectorAll("select, input").forEach((el) => el.addEventListener("change", saveSettingsFromPanel));
    panel.querySelector("#__codex_li_start_from_list").addEventListener("click", startFromConnectionsList);
    panel.querySelector("#__codex_li_view_results").addEventListener("click", renderResultsPanel);
    panel.querySelector("#__codex_li_stop_list").addEventListener("click", stopAllTasks);
  }

  function renderLauncher() {
    if (document.getElementById("__codex_li_launcher") || document.getElementById("__codex_li_connections_panel")) return;
    const launcher = document.createElement("div");
    launcher.id = "__codex_li_launcher";
    launcher.style.cssText = "position:fixed;z-index:2147483646;right:110px;bottom:18px;display:flex;gap:6px;flex-wrap:wrap;font:13px Arial,sans-serif;";
    launcher.innerHTML = `
      <button id="__codex_li_open_panel" style="background:#0a66c2;color:#fff;border:0;border-radius:6px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.25);">打开采集面板</button>
      <button id="__codex_li_open_results" style="background:#fff;color:#0a66c2;border:1px solid #0a66c2;border-radius:6px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,.18);">查看数据</button>
    `;
    document.body.appendChild(launcher);
    launcher.querySelector("#__codex_li_open_panel").addEventListener("click", renderConnectionsPanel);
    launcher.querySelector("#__codex_li_open_results").addEventListener("click", renderResultsPanel);
  }

  async function startFromConnectionsList() {
    const status = document.getElementById("__codex_li_connections_status");
    saveSettingsFromPanel();
    const batchLimit = boundedNumber(document.getElementById("__codex_li_batch_limit")?.value, DEFAULT_BATCH_LIMIT, 1, 100);
    const delaySeconds = boundedNumber(document.getElementById("__codex_li_delay_seconds")?.value, DEFAULT_DELAY_SECONDS, 3, 60);
    const profileInfoSeconds = boundedNumber(document.getElementById("__codex_li_profile_info_seconds")?.value, DEFAULT_PROFILE_INFO_SECONDS, 2, 30);
    const afterProfileSeconds = boundedNumber(document.getElementById("__codex_li_after_profile_seconds")?.value, DEFAULT_AFTER_PROFILE_SECONDS, 0, 30);
    const restAfter = boundedNumber(document.getElementById("__codex_li_rest_after")?.value, DEFAULT_REST_AFTER, 0, 100);
    const restMinutes = boundedNumber(document.getElementById("__codex_li_rest_minutes")?.value, DEFAULT_REST_MINUTES, 5, 240);
    const skipCollected = document.getElementById("__codex_li_skip_collected")?.checked !== false;
    const incrementalMode = document.getElementById("__codex_li_incremental_mode")?.checked !== false;
    const savedState = await storageGet(["results", "lastIncrementalUpdateDate"]);
    const results = savedState.results || [];
    const sinceEl = document.getElementById("__codex_li_since_date");
    if (incrementalMode && savedState.lastIncrementalUpdateDate && sinceEl && !sinceEl.value) {
      sinceEl.value = savedState.lastIncrementalUpdateDate;
    }
    const skipProfiles = skipCollected
      ? new Set(results.map((row) => normalizeProfileUrl(row.profile_url || "")).filter(Boolean))
      : new Set();
    if (batchLimit > 50 && !confirm("本次采集人数超过 50，风控风险较高。建议分批低速采集。确定继续吗？")) return;
    if (batchLimit > 20 && delaySeconds < 10 && !confirm("采集人数较多且间隔较短，可能增加 LinkedIn 风控风险。建议把间隔设为 10 秒以上。确定继续吗？")) return;
    if (restAfter === 0 && !confirm("你关闭了自动休息。长时间连续采集可能增加风控风险。确定继续吗？")) return;
    await storageSet({ collecting: true, running: false });
    if (status) status.textContent = `准备采集：本次最多 ${batchLimit} 个。`;
    let items = [];
    let stableRounds = 0;
    let lastCount = 0;
    const maxRounds = Math.max(80, batchLimit * 4);

    for (let round = 0; round < maxRounds; round += 1) {
      const { collecting = true } = await storageGet(["collecting"]);
      if (!collecting) return;

      items = collectVisibleProfileUrls(items, skipProfiles);
      if (status) status.textContent = `正在读取好友列表：${items.length} / ${batchLimit}；滚动加载 ${round + 1} 次`;
      if (items.length >= batchLimit) break;

      if (items.length === lastCount) stableRounds += 1;
      else stableRounds = 0;
      lastCount = items.length;

      const clickedMore = stableRounds >= 2 ? clickListLoadMoreButton() : false;
      const moved = scrollConnectionsListPage();
      if (stableRounds >= 15 && !moved && !clickedMore) break;
      await sleep(stableRounds >= 3 ? 1400 : 900);
    }

    items = collectVisibleProfileUrls(items, skipProfiles);
    items = items.slice(0, batchLimit);
    if (!items.length) {
      const cutoff = document.getElementById("__codex_li_since_date")?.value || "";
      if (status) status.textContent = cutoff
        ? "没有采集到符合日期的好友。可能是日期筛选太严格，或页面未显示添加日期。"
        : "没有采集到好友主页链接，请确认当前是 LinkedIn 好友列表页。";
      if (incrementalMode) {
        await storageSet({ lastIncrementalUpdateDate: todayDateString(), lastIncrementalUpdateAt: new Date().toISOString() });
      }
      await storageSet({ collecting: false });
      return;
    }

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    await storageSet({
      queue: items,
      index: 0,
      running: true,
      collecting: false,
      delayMs: delaySeconds * 1000,
      profileInfoMs: profileInfoSeconds * 1000,
      afterProfileMs: afterProfileSeconds * 1000,
      runId,
      batchLimit,
      restAfter,
      restMinutes,
      restUntil: 0,
      lastRestIndex: 0,
      runIncrementalMode: incrementalMode ? "1" : "0",
      batchStartedAt: new Date().toISOString()
    });
    if (status) status.textContent = `采集完成：${items.length} 个。速度：每人间隔 ${delaySeconds} 秒；开始整理第 1 个。`;
    await sleep(800);
    location.href = toProfileUrl(items[0].profile_url);
  }

  async function saveResult(row) {
    const { results = [] } = await storageGet(["results"]);
    const next = results.filter((item) => item.profile_url !== row.profile_url);
    next.push(row);
    await storageSet({ results: next });
  }

  async function goNextIfEnabled(expectedIndex) {
    const { queue = [], index = 0, running = false, delayMs = NEXT_PROFILE_DELAY_MS, restAfter = DEFAULT_REST_AFTER, restMinutes = DEFAULT_REST_MINUTES, lastRestIndex = 0, runIncrementalMode = "1" } = await storageGet(["queue", "index", "running", "delayMs", "restAfter", "restMinutes", "lastRestIndex", "runIncrementalMode"]);
    if (!running) return;
    if (typeof expectedIndex === "number" && index !== expectedIndex) return;
    const nextIndex = index + 1;
    await storageSet({ index: nextIndex });
    if (nextIndex >= queue.length) {
      const doneState = { running: false };
      if (runIncrementalMode !== "0") {
        doneState.lastIncrementalUpdateDate = todayDateString();
        doneState.lastIncrementalUpdateAt = new Date().toISOString();
      }
      await storageSet(doneState);
      await closeContactInfoView();
      renderCompletionNotice(queue.length, Number(restMinutes) || DEFAULT_REST_MINUTES);
      return;
    }
    if (Number(restAfter) > 0 && nextIndex > Number(lastRestIndex) && nextIndex % Number(restAfter) === 0) {
      const minutes = Number(restMinutes) || DEFAULT_REST_MINUTES;
      const restUntil = Date.now() + minutes * 60000;
      await storageSet({ running: false, restUntil, lastRestIndex: nextIndex });
      renderRestTimer(nextIndex, queue.length, minutes, restUntil);
      return;
    }
    await sleep(Number(delayMs) || NEXT_PROFILE_DELAY_MS);
    location.href = toProfileUrl(queue[nextIndex].profile_url || queue[nextIndex]);
  }

  async function run() {
    renderPersistentResultsButton();
    const restState = await storageGet(["running", "restUntil", "index", "queue", "restMinutes"]);
    if (!restState.running && Number(restState.restUntil) > Date.now() && Array.isArray(restState.queue) && restState.queue.length && !document.getElementById("__codex_li_rest_timer_panel")) {
      renderRestTimer(Number(restState.index) || 0, restState.queue.length, Number(restState.restMinutes) || DEFAULT_REST_MINUTES, Number(restState.restUntil));
    }
    if (CONNECTIONS_PATH.test(location.pathname)) {
      const { running = false, collecting = false } = await storageGet(["running", "collecting"]);
      if (running || collecting) renderConnectionsPanel();
      else renderLauncher();
      return;
    }
    if (PROFILE_PATH.test(location.pathname)) {
      const { queue = [], index = 0, running = false, runId = "" } = await storageGet(["queue", "index", "running", "runId"]);
      const currentProfile = normalizeProfileUrl(location.href);
      if (!running || !queue.length) {
        return;
      }
      renderProfilePanel();
      const queueItem = queue[index] || {};
      const expectedProfile = normalizeProfileUrl(queueItem.profile_url || queueItem);
      if (expectedProfile && currentProfile !== expectedProfile) return;
      const runKey = `${index}:${currentProfile}`;
      if (activeProfileRunKey === runKey) return;
      activeProfileRunKey = runKey;
      await autoClickAndCollect(queue, index, queueItem);
      return;
    }
    if (!CONTACT_PATH.test(location.pathname)) return;
    renderLogPanel("LinkedIn Contact Collector", [
      "Contact info page opened.",
      `Waiting ${(CONTACT_MODAL_AFTER_CLICK_WAIT_MS / 1000).toFixed(1)} seconds before extraction...`
    ]);
    await sleep(CONTACT_MODAL_AFTER_CLICK_WAIT_MS);
    const { queue = [], index = 0, running = false } = await storageGet(["queue", "index", "running"]);
    const queueItem = queue[index] || {};
    const currentProfile = normalizeProfileUrl(location.href);
    const expectedProfile = normalizeProfileUrl(queueItem.profile_url || queueItem);
    if (running && expectedProfile && currentProfile !== expectedProfile) return;
    await collectCurrentContact(queue, index, queueItem);
  }

  run().catch((error) => {
    console.error("LinkedIn Contact Collector failed", error);
  });

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      run().catch((error) => console.error("LinkedIn Contact Collector failed after navigation", error));
    } else if (CONNECTIONS_PATH.test(location.pathname) && !document.getElementById("__codex_li_connections_panel") && !document.getElementById("__codex_li_launcher")) {
      run().catch((error) => console.error("LinkedIn Contact Collector failed while idle", error));
    }
  }, 1500);
})();
