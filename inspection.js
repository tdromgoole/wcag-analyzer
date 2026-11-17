// Informational inventories, separate from axe pass/fail results.
globalThis.accessLensInventory = () => {
  const groups = { features: [], alerts: [], structure: [], aria: [], order: [] };
  function selector(el) {
    const parts=[];
    while(el?.nodeType===1) {
      const tag=el.localName;
      const siblings=el.parentElement ? [...el.parentElement.children].filter(s=>s.localName===tag) : [];
      parts.unshift(tag+(siblings.length>1 ? `:nth-of-type(${siblings.indexOf(el)+1})` : ''));
      if(el.parentElement) el=el.parentElement;
      else if(el.getRootNode().host) return [...selector(el.getRootNode().host), parts.join(' > ')];
      else break;
    }
    return [parts.join(' > ')];
  }
  function add(category,id,help,icon,el) {
    let group=groups[category].find(g=>g.id===id);
    if(!group) {group={id,help,icon,description:'Informational page inventory. Presence alone does not indicate accessibility conformance.',tags:[],nodes:[]};groups[category].push(group);}
    group.nodes.push({target:selector(el),html:el.outerHTML.slice(0,1500),text:(el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || '').trim().slice(0,200),attributes:Object.fromEntries([...el.attributes].filter(a=>a.name.startsWith('aria-') || ['role','alt','lang','tabindex'].includes(a.name)).map(a=>[a.name,a.value]))});
  }
  function walk(scope) { for(const el of scope.querySelectorAll('*')) {
    if(el.id==='access-lens-extension') continue;
    if(el.shadowRoot) walk(el.shadowRoot);
    const tag=el.localName, role=el.getAttribute('role');
    if(/^h[1-6]$/.test(tag)) add('structure',tag,`Heading level ${tag[1]}`,tag,el);
    const structural={ul:['Unordered list','☷'],ol:['Ordered list','≡'],header:['Header','▣'],nav:['Navigation','☰'],main:['Main','▣'],footer:['Footer','▤'],table:['Table','▦']};
    if(structural[tag]) add('structure',tag,...structural[tag],el);
    if(tag==='img' && el.hasAttribute('alt')) add('features',el.alt ? 'image-alt' : 'empty-alt',el.alt ? 'Image with alternative text' : 'Empty alternative text', '▧',el);
    if (tag === 'img' && el.hasAttribute('alt')) {
      const alt = el.alt.trim();
      if (!alt) add('alerts', 'alt-empty', 'Empty alternative text: verify image is decorative', '!', el);
      if (alt.length > 100) add('alerts', 'alt-long', 'Long alternative text: review for clarity', '!', el);
      if (/^(image|photo|picture|graphic|spacer)( of)?$|\.(png|jpe?g|gif|svg|webp)$/i.test(alt)) add('alerts', 'alt-suspicious', 'Suspicious alternative text: review description', '!', el);
      if (alt && [el.previousElementSibling, el.nextElementSibling].some(sibling => sibling?.textContent.trim().toLowerCase() === alt.toLowerCase())) add('alerts', 'alt-redundant', 'Alternative text repeats adjacent text', '!', el);
    }
    if(tag==='label') add('features','label','Form label','◇',el);
    if(el.hasAttribute('lang')) add('features','language','Language','◎',el);
    if([...el.attributes].some(a=>a.name.startsWith('aria-')) || role) add('aria','aria','ARIA attributes / role','A',el);
    if(el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) add('aria','aria-label','ARIA label','◇',el);
    if(el.hasAttribute('aria-hidden')) add('aria','aria-hidden',`ARIA hidden attribute`,'⊗',el);
    if(el.tabIndex>=0 && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && !el.closest('[inert]')) add('order','focus-order','Keyboard focus order','→',el);
  } }
  walk(document);
  const nodes=groups.order[0]?.nodes;
  if(nodes) nodes.sort((a,b)=>{const av=Number(a.attributes.tabindex)||0,bv=Number(b.attributes.tabindex)||0;return (av>0?av:Infinity)-(bv>0?bv:Infinity);});
  return groups;
};
