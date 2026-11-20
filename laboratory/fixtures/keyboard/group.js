(() => {
 const group=document.querySelector('#case-target'), first=document.querySelector('#first'), last=document.querySelector('#last'), state=document.querySelector('#state');let active=false;
 document.querySelector('#trigger').onclick=()=>{active=true;state.textContent='Active.';first.focus();};
 document.querySelector('#reset').onclick=()=>{active=false;state.textContent='Inactive.';document.querySelector('#trigger').focus();};
 group.addEventListener('keydown',event=>{if(!active||group.dataset.trap!=='true'||event.key!=='Tab'||event.ctrlKey||event.altKey||event.metaKey)return;if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}});
})();
