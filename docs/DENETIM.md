# Denetim — arayüz yenilemesinden önce (29 Eylül 2026)

Kapsam: `master` `4db4a91`. Oyun yerel sunucuda (`python -m http.server`) Playwright
ile açıldı (masaüstü 1280x720, mobil 390x844 dokunmatik @2x), ilk 30 sn oynandı, girdiye cevap
ve konsol ölçüldü. Ekran görüntüleri: `kanit/nova-drift/once/`. Bu bir kod incelemesiyle de
desteklendi (`script.js`, `styles.css`, `index.html`).

## Ölçümler (bu makine, gerçek GPU / d3d11)

| | Önce |
|---|---|
| İlk yükleme | 809 419 bayt, 20 istek, hepsi aynı kaynaktan |
| Konsol | Hata yok (masaüstü ve mobil) |
| Kare süresi 1280x720, vsync kapalı | boşta 6,4 ms (≈155 FPS), oyunda 5,3–5,8 ms (≈180 FPS) |
| Kare süresi 1920x1080, vsync kapalı | boşta ≈7 ms, oyunda 12–13 ms (≈80 FPS) |
| Ekran hızı sınırlı (normal kullanım) | 60 FPS, uyarlanabilir çözünürlük devreye girmiyor |
| Girdi (fare) → gemi | bir kareden az (bkz. TASARIM.md §4) |
| Hiç girdi vermeden ölüm | evet; skorlar 63 (mobil) ve 127 (masaüstü) |

## Sorular ve cevaplar

**İlk 30 saniye anlaşılıyor mu?** Kısmen. Başlangıç ekranı beş satır bilgi taşıyor (slogan, üç
kontrol, iki gösterge, üç güç-artırıcı simgesi) ve BAŞLA düğmesi bunların arasında küçük kalıyor.
Oyun içinde hiçbir açıklama yok: oyuncu kürelerin toplanacağını, kayaların öldürdüğünü yalnız
başlangıç ekranındaki minik göstergelerden öğreniyor. İlk oyunda ilk saniyelerde kaya geliyor
(spawn aralığı ilk 0,25 sn'den başlıyor), yani öğrenme payı yok.

**Kontroller hemen cevap veriyor mu?** Evet; gemi hedefe `1 - e^(-8·dt)` ile yaklaşıyor. Girdi
gecikmesi bir kare. Tam genişlikte bir hareketin %90'ına varış yaklaşık 0,28 sn.

**Zorluk eğrisi adil mi?** Hız 9 → 27 birim/sn'ye 128 sn'de çıkıyor, doğrusal; makul. Sorun
başlangıçta: ilk saniyelerde yoğunluk düşük değil, oyuncu hem kontrolü hem hedefi aynı anda öğreniyor.

**Oyun bitince ne oluyor?** "ÇARPIŞMA" ekranı çıkıyor, skor, "yeni rekor!" ve ilk 5; düğme
"TEKRAR DENE". Klavyede Boşluk/Enter ile de yeniden başlıyor. Menüye dönüş yok (başlangıç
ekranına yalnız sayfa yenilenerek dönülüyor).

**Mobil ve dokunmatik.** Sanal joystick ekranın herhangi bir yerine dokununca çıkıyor; işe
yarıyor. **Bulgu (dikey ekran):** kamera dikey görüş açısı 72° sabit; 390x844'te yatay görüş
yaklaşık 37°, oysa oyun alanı ±2,25 birim ve kameraya 4,4 birim uzaklıkta görünen yarı genişlik
yalnız ≈1,5 birim. Yani gemi dikey ekranda kenarlara gittiğinde ekran dışına çıkabiliyor.

**Konsolda hata var mı?** Yok. Yalnız yazılım-GL sürücüsünün performans iletileri (Chromium,
oyunla ilgisiz).

## Bulgular (önem sırasıyla)

1. **Yönlendirme yok:** ilk oyun anlatısız; ilk 4 sn'de kaya geliyor.
2. **Başlangıç ekranı kalabalık;** birincil eylem (BAŞLA) yazı ve simge yığını içinde kayboluyor.
3. **Dikey ekranda oyun alanı sığmıyor** (yukarıdaki görüş açısı sorunu).
4. **Ayarlar yok:** ses tek bir emoji düğmesi (🔊/🔇), dil yalnız tarayıcıdan geliyor, oyuncu değiştiremiyor.
5. **Duraklatma kartında yalnız DEVAM ET** var; baştan başlama ve menüye dönüş yok. Oyun sonunda da menü yok.
6. **Görünüm tanıtım videosundan farklı:** Orbitron + degrade/parıltılı gölgeli başlık, pembe-krem
   hap düğmeler, emoji simgeler (🖱️ 👆 ⌨️ ⏸ 🔊) — video Instrument Sans + JetBrains Mono, düz
   renk, keskin köşeli düğmeler ve kâğıt rengi kartlarla kurulu.
7. **Odak halkası yok;** klavye ile gezinen kullanıcı nerede olduğunu göremiyor (`outline`
   tarayıcı varsayılanında, koyu zeminde okunmuyor).
8. **Boşta menü sahnesi:** gemi menü yazısının üstüne biniyor (kamera 4,4 birim, gemi z=0).
9. **Kayıt anahtarı düzeni sağlam** (`novaDriftScores`, `novaDriftBest`, `novaDriftMuted`,
   `novaDriftDaily-…`); dokunulmayacak.

## Bu sürümde ele alınmayanlar

- Çekirdek mekanik (tünel, spawn, RNG, günlük mod, puanlama, çarpışma) aynen kalır.
- Gerçek telefonda deneme yapılmadı; dokunmatik yalnız Playwright emülasyonunda denendi.
- Oyuncu ölçümü botla temsil edilmez (bkz. `bot-olcumu-insani-temsil-etmez`): hissi ölçen sayılar
  yalnızca gecikme/tepki süresi; "eğlenceli mi" ayrıca oynayarak değerlendirilmeli.
