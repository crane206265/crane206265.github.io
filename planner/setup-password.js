(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  $('setup-form').addEventListener('submit', async event => {
    event.preventDefault(); $('setup-message').textContent = ''; $('result').hidden = true;
    if ($('new-password').value !== $('confirm-password').value) { $('setup-message').textContent = '비밀번호가 서로 다릅니다.'; return; }
    $('generate').disabled = true;
    try {
      if (!crypto.subtle) throw new Error('HTTPS 또는 localhost에서 열어 주세요.');
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const input = await crypto.subtle.importKey('raw', new TextEncoder().encode($('new-password').value), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, input, 256);
      $('auth-config').value = JSON.stringify({ salt: b64(salt), key: b64(bits), iterations: 600000 });
      new Uint8Array(bits).fill(0); $('result').hidden = false;
      $('setup-message').textContent = '설정값을 만들었습니다. Apps Script에 등록한 뒤 아래의 지우기 버튼을 눌러 주세요.';
    } catch (e) { $('setup-message').textContent = e.message; }
    finally { $('new-password').value = ''; $('confirm-password').value = ''; $('generate').disabled = false; }
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('auth-config').value); $('setup-message').textContent = '복사했습니다.'; }
    catch (_) { $('auth-config').select(); $('setup-message').textContent = '선택된 값을 직접 복사해 주세요.'; }
  });
  $('clear').addEventListener('click', () => { $('auth-config').value = ''; $('result').hidden = true; $('setup-message').textContent = ''; });
})();
