(() => {
 const start=document.querySelector('#trigger'), reset=document.querySelector('#reset'), input=document.querySelector('#case-target'), notice=document.querySelector('#notice'), extend=document.querySelector('#extend');
 let timer=null, deadline=0, extensions=0;
 const stop=()=>{clearInterval(timer);timer=null;};
 const tick=()=>{if(Date.now()>=deadline){stop();input.disabled=true;notice.textContent='Time expired. Reset to begin another attempt.';if(extend)extend.hidden=true;}};
 start.addEventListener('click',()=>{stop();extensions=0;deadline=Date.now()+30000;input.disabled=false;start.disabled=true;if(extend){extend.hidden=false;extend.disabled=false;notice.textContent='30 seconds remain. Extend now to keep working; ten extensions are available.';}else notice.textContent='The task expires in 30 seconds without an extension option.';timer=setInterval(tick,250);});
 if(extend)extend.addEventListener('click',()=>{if(!timer||Date.now()>=deadline){tick();return;}deadline=Date.now()+30000;extensions++;notice.textContent='30 seconds remain. Extensions used: '+extensions+' of 10.';extend.disabled=extensions>=10;});
 reset.addEventListener('click',()=>{stop();deadline=0;extensions=0;input.disabled=true;input.value='Inspect trail sign';start.disabled=false;if(extend)extend.hidden=true;notice.textContent='Timer not started.';});
 addEventListener('pagehide',stop);
})();
