(() => {
  const samples = document.querySelector('#samples'), state = document.querySelector('#state');
  const create = (tag, text) => { const element = document.createElement(tag); if (text) element.textContent = text; return element; };
  document.querySelector('#generate').onclick = () => {
    const count = Number(document.querySelector('#size').value);
    if (![10, 40, 100].includes(count)) return;
    const fragment = document.createDocumentFragment();
    for (let index = 1; index <= count; index++) {
      const section = create('section'); section.append(create('h2', `Synthetic group ${index}`));
      for (const good of [false, true]) {
        const row = create('div');
        const image = create('img'); image.src = 'assets/mountain.svg'; image.width = 120; image.height = 70;
        if (good) image.alt = 'Mountain at the end of the trail';
        const button = create('button', good ? 'Choose trail' : undefined); button.type = 'button';
        const input = create('input'); input.id = `stress-input-${index}-${good ? 'good' : 'bad'}`;
        row.append(image, button);
        if (good) { const label = create('label', 'Trail note'); label.htmlFor = input.id; row.append(label); }
        row.append(input); section.append(row);
      }
      fragment.append(section);
    }
    samples.replaceChildren(fragment); state.textContent = `${count} groups generated. Three intentional rule failures per group are expected; these are not actual scan results.`;
  };
  document.querySelector('#clear').onclick = () => { samples.replaceChildren(); state.textContent = 'No examples generated.'; };
})();
