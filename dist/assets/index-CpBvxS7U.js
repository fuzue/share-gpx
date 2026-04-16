(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const a of t.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function r(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function s(e){if(e.ep)return;e.ep=!0;const t=r(e);fetch(e.href,t)}})();function g(p){p.innerHTML=`
    <div class="upload-wrapper">
      <div class="upload-card">
        <h1>Share a GPX Trail</h1>
        <div class="drop-zone" id="dropZone">
          <span id="dropLabel">Drop .gpx file here or <label for="fileInput">browse</label></span>
          <input type="file" id="fileInput" accept=".gpx" hidden />
        </div>
        <input type="password" id="apiKey" class="api-key-input" placeholder="API key" autocomplete="current-password" />
        <button id="uploadBtn" class="upload-btn" disabled>Upload</button>
        <div id="result" class="result hidden"></div>
      </div>
    </div>
  `;const o=document.getElementById("dropZone"),r=document.getElementById("fileInput"),s=document.getElementById("dropLabel"),e=document.getElementById("apiKey"),t=document.getElementById("uploadBtn"),a=document.getElementById("result");e.value=localStorage.getItem("gpx-api-key")||"";let l=null;o.addEventListener("click",n=>{n.target!==document.querySelector('label[for="fileInput"]')&&r.click()}),o.addEventListener("dragover",n=>{n.preventDefault(),o.classList.add("drag-over")}),o.addEventListener("dragleave",()=>o.classList.remove("drag-over")),o.addEventListener("drop",n=>{n.preventDefault(),o.classList.remove("drag-over");const i=n.dataTransfer.files[0];i&&i.name.toLowerCase().endsWith(".gpx")&&u(i)}),r.addEventListener("change",()=>{r.files[0]&&u(r.files[0])});function u(n){l=n,s.textContent=n.name,f()}e.addEventListener("input",f);function f(){t.disabled=!l||!e.value.trim()}t.addEventListener("click",async()=>{const n=e.value.trim();localStorage.setItem("gpx-api-key",n),t.disabled=!0,t.textContent="Uploading…",a.classList.add("hidden");const i=new FormData;i.append("file",l);try{const d=await fetch("/upload",{method:"POST",headers:{"X-API-Key":n},body:i});if(!d.ok){const y=await d.text();throw new Error(y.trim()||`HTTP ${d.status}`)}const{url:c}=await d.json();a.classList.remove("hidden"),a.innerHTML=`
        <span>Trail shared!</span>
        <a href="${c}" target="_blank">${c}</a>
        <button id="copyBtn">Copy link</button>
      `,document.getElementById("copyBtn").addEventListener("click",function(){navigator.clipboard.writeText(c).then(()=>{this.textContent="Copied!"})})}catch(d){a.classList.remove("hidden"),a.innerHTML=`<span class="error">Upload failed: ${d.message}</span>`}finally{t.disabled=!1,t.textContent="Upload"}})}const v=window.location.pathname,h=/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,m=document.getElementById("app");h.test(v)?m.textContent="Share view coming soon…":g(m);
