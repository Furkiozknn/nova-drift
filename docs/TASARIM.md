# Tasarım — arayüz yenilemesi (29 Eylül 2026)

Hedef: oyuncu tanıtım videosundan (`sosyal/videolar/2026-09-30-nova-drift/en.mp4`) geldiğinde aynı
dünyayı bulsun. Çekirdek mekanik (tünel, spawn, RNG, günlük mod, puanlama, çarpışma, kayıtlar) **aynen**
kaldı; değişen görünüm, arayüz, dil, ilk oyun öğretmesi, geri bildirim ve dikey ekranda görüş açısı.
Denetim bulguları: `docs/DENETIM.md`.

## 1. Videodan çıkarılan stil rehberi

Kareler ffmpeg ile çıkarıldı (`kanit/nova-drift/video-kare/`), renkler piksel örneklenerek alındı
(açılış bandı, oyun penceresi, ilerleme çizgisi). Oyun zemini videoda deniz mavisi/mor tünel + amber
çizgi; açılışta üç renk bandı (mor → pembe → camgöbeği) kayıyor.

| Rol | Kod | Videoda nerede |
|---|---|---|
| Mürekkep (zemin, düğme yazısı) | `#0d071a` | oyun penceresi altı, gece zemini |
| Kâğıt (metin, kart) | `#eef1ff` | başlık metni |
| Camgöbeği | `#7bdff6` | üçüncü açılış bandı; birincil düğme |
| Pembe | `#f577b2` | ikinci açılış bandı; kart üst çizgisi |
| Mor | `#b5a4fa` | birinci açılış bandı |
| Amber | `#ffab40` | oyun penceresinin turuncu çizgisi; yeni rekor damgası |
| Yeşil-nane | `#7dffc8` | skor kademesi (yalnız oyun içi vurgu) |

- **Yazı tipleri:** Instrument Sans (Regular/Bold) gövde, başlık, düğme; JetBrains Mono Bold BÜYÜK HARF, harf
  aralığı 0,18 em, etiketler ve HUD. Yerel woff2 alt kümeleri `vendor/fonts/` (Latin + Türkçe harfler,
  toplam 61,5 KB; Orbitron çıkarıldı, −11,8 KB). Lisans metinleri `OFL-*.txt`. Google Fonts'a bağlanılmaz.
- **Şekil dili:** düz renk, gölgesiz (metin parıltısı/`text-shadow` kalktı); düğmeler 6 px köşeli
  dikdörtgen; kartlar kâğıt rengi, 22 px köşe, 8 px renkli üst çizgi. Oyun sahnesi (halkalar, gemi,
  kayalar, bloom) aynen; videodaki dünya zaten bu.
- **Rol dağılımı:** camgöbeği = topla / birincil eylem, kırmızı = öldürür, amber = rekor, pembe/mor = vurgu.
- **Hareket:** giriş 220 ms ease-out (cubic-bezier .16,1,.3,1), çıkış 140 ms ease-in, düğme basışı 90 ms
  %96 ölçek, menü öğeleri 40 ms arayla sıralı. Yaylanma yok (tek istisna: rekor damgası, 260 ms).
  Ekran geçişi: palet renginde iris (daire) 260 ms örter + 200 ms açılır. `prefers-reduced-motion`:
  animasyon, geçiş bandı, FOV vuruşu ve skor vuruşu kapalı.

## 2. Ekran listesi

1. **Başlangıç:** sol üstte mono etiket (`FREE · IN YOUR BROWSER` / `ÜCRETSİZ · TARAYICIDA`), büyük
   başlık, üç renk şeridi, **büyük OYNA/PLAY** (camgöbeği), tek cümle nasıl oynanır, ikincil: Günlük
   mod, Ayarlar; en iyi 5 skor (ya da "henüz skor yok"). Güç-artırıcı ve renk açıklama göstergeleri
   kaldırıldı (oyun içinde chip adı yazıyor).
2. **HUD:** üstte büyük skor (kademe rengi), sol üstte mono `BEST: n`, sağ üstte duraklat + ses düğmeleri
   (SVG simge, emoji yok); güç-artırıcı chip'leri yalnız aktifken. İlk oyunda bir satır ipucu.
3. **Duraklat:** kâğıt kart: Devam (odak burada), Baştan, Ayarlar, Menü. Esc/P.
4. **Oyun sonu:** kart: `RUN ENDED`, büyük skor, **YENİ REKOR** damgası (amber), en iyi, ilk 5,
   **Tekrar dene** (odak burada; Enter/Boşluk), Menü. Kart üst çizgisi rekorda amber, değilse skorun
   ulaştığı kademe rengi.
5. **Ayarlar:** Ses (açık/kapalı), Dil (EN/TR). Başlangıçtan ve duraklatmadan açılır; Esc kapatır.

## 3. Dil (TR/EN)

`script.js` başında iki sözlük (`STR.en`, `STR.tr`); işaretlemedeki `data-i18n` öznitelikleri ve
dinamik metinler (`t.best`, `t.on` …) tek yerden gelir. Varsayılan `navigator.language`: `tr*` ise
Türkçe, değilse İngilizce. Oyuncu Ayarlar'dan değiştirirse tercih **yeni** anahtarda saklanır
(`novaDriftLang`), açılışta tarayıcı dilinden önceliklidir. Var olan hiçbir anahtar
(`novaDriftScores`, `novaDriftBest`, `novaDriftMuted`, `novaDriftDaily-…`) değişmedi; bunu
`language.spec.js` denetliyor (kayıtlı skor dil değişince bozulmuyor). Yeni: `novaDriftPlayed`
(ilk oyun bayrağı). Metinler İngilizcede doğal ("Steer with mouse, touch or arrows…"), Türkçe düz
çeviri değil.

## 4. Oynanış hissi

| Konu | Karar | Gerekçe / ölçü |
|---|---|---|
| Girdi gecikmesi | Değişmedi | `test/feel.spec.js` + gerçek GPU'da 20 örnek: fare olayı → gemi durumu ortalama 8,4 ms, p95 13,3 ms, en çok 13,7 ms (≤ bir kare @60 Hz). Oyun ek gecikme eklemiyor. |
| Gemi yakınsama | Değişmedi | Tam genişlik hareketin %90'ı 0,283 sn (simüle zaman, `feel.spec.js` sınırı 0,5 sn). Tasarlanmış ataleti korumak için el sürülmedi. |
| İlk oyun | Öğretme + ilk 4 sn kayasız | Yalnızca hiç oynanmamış profilde (ve günlük mod dışında): ilk 4 sn'de kaya yuvaları küreye dönüşüyor; tek satır ipucu 5,5 sn (dokunmatik: "Drag anywhere to steer…"), klavye satırı 3 sn. Sonraki oyunlar aynen eski. Test: ilk oyunda 3,8 sn'de spawn günlüğünde kaya yok, ikinci oyunda var. |
| Geri bildirim | Eklendi | Küre toplama: 5 parçacıklı camgöbeği patlama; güç-artırıcı: 10 parçacıklı amber patlama (mevcut 70'lik havuz, yeni geometri yok); skor kademesi (her 250 puan) rengi değiştirir ve 300 ms vurur; oyun başında 450 ms "warp" (dikey görüş açısı +14° → geri, `fov` kick). Ölüm sarsıntısı/flaş/ses korundu. |
| Dikey ekran | Düzeltildi | Oran < 1'de dikey FOV genişler (yatay ≥ ~55° kalır, tavan 96°): 390x844'te yatay görüş 37° → 55°, gemi kenarda ekran içinde kalıyor. Yatay ekranlarda FOV 72° aynı. |
| Menü sahnesi | Düzeltildi | Boşta gemi z=−4,2, y=−0,85: menü metninin üstüne binmiyor. |
| Zorluk eğrisi | Değişmedi | Hız/spawn sabitleri aynen; yalnız ilk-oyun payı. |

Uyarı: bu sayılar ölçülebilen tepki süreleridir. Botun/kayıtın iyi oynaması oyunun insana iyi
geldiği anlamına gelmez; gerçek telefonda denenmedi (dokunmatik yalnız emülasyonda). Pilot
(`test/record-reel.js`) yalnız klip içindir; gecikmeli ve titremeli fare girdisi kullanır.

## 5. Günlük videolardaki palet ve geçişlerden alınanlar

Kaynak: `sosyal/uret/tema.mjs` → `TEMALAR.uzay` ("Derin uzay") ve `sahne.js` geçiş aileleri. Oyunun
kendi dünyası (videodaki mor/pembe/camgöbeği bantlar, deniz mavisi zemin) ağır bastı; uzay
teması buna en yakın olan (çivit/mor zemin, amber-lavanta-buz-pembe-nane vurgular).

| Alınan | Nereden | Oyunda nerede |
|---|---|---|
| Amber `#ffab40`, nane `#7dffc8` (uzay teması vurguları) | `TEMALAR.uzay.akis.vurgular` | rekor damgası + kart çizgisi, skor kademesi, güç-artırıcı patlaması |
| Camgöbeği/mor/pembe (videonun kendi bantları; uzay temasındaki buz `#7fe7ff`, lavanta `#b9a8ff`, pembe `#ff7ab6` karşılığı) | video örneği | düğme, şerit, geçiş bandı, kart üst çizgisi |
| **Renk akışı** (vurgular arasında dönüş, "orta" yoğunluk) | `renkAkisi()` | skor sayacı her 250 puanda bir sonraki vurgu rengine geçer (`ACCENTS`), geçiş bandı her geçişte sıradaki renkle örter |
| **iris** geçişi | `GECIS.iris` (`clip-path: circle`) | başlangıç → oyun, duraklat/oyun sonu → menü (260 ms örtme, 200 ms açma) |
| **warp** geçişi | `GECIS.warp` | her oyun başında FOV vuruşu (72° → 86° → 72°, 450 ms); CSS ölçeği yerine kameranın kendisi, ek maliyet yok |
| **kararma** (fade) | `GECIS.kararma` | dil değişiminde metin 250 ms'de yeniden belirir; kartlar/menü girişi 220 ms opaklık + 14 px yükseliş |
| **vuruş** (`#world` 1+k → 1, 300 ms) | `V.vurgular` | skor kademesi ve "beat" animasyonu (ölçek 1,14 → 1, 300 ms), yeni rekor damgası girişi |

Okunabilirlik: `ESIK` 5:1 hedefi yerine WCAG AA 4,5:1 zorunlu tutuldu ve test edildi
(`test/contrast.spec.js`): tüm skor kademesi renkleri `#0d071a` üstünde, düğme/kart/etiket/damga
çiftleri ≥ 4,5:1 (en düşük hesaplanan çift pembe/mürekkep 7,68:1, düğme yazısı 12,92:1). Yalnız CSS/JS'ten; ek varlık, ek render geçişi yok.

## 6. Önce / sonra

| | önce | sonra |
|---|---|---|
| İlk yükleme | 809 419 bayt, 20 istek | 868 177 bayt (+58 758: iki yazı tipi ailesi 3 dosya 61,5 KB, Orbitron −11,8 KB, HTML/CSS/JS +9 KB), 19 istek |
| Kare süresi 1280x720, vsync kapalı (2 koşu) | boşta 6,4 / 6,6 ms; oyunda 5,3 / 5,8 ms | boşta 4,3 / 4,4 ms; oyunda 5,3 / 5,4 ms |
| Kare süresi 1920x1080, vsync kapalı (2 koşu) | boşta 7,0 / 6,6 ms; oyunda 13,5 / 11,8 ms | boşta 6,7 / 6,6 ms; oyunda 11,0 / 11,4 ms |
| Normal (vsync) | 60 FPS | 60 FPS |
| Girdi gecikmesi | (kanca yok; kod aynı) | 8,4 ms ort. |
| Test | 42 (Windows'ta 41 geçer; bkz. not) | 61 (Windows'ta 60 geçer; aynı tek Windows/CRLF kırmızısı) |

Ölçüm: `--use-angle=d3d11` gerçek GPU, `--disable-frame-rate-limit --disable-gpu-vsync`, 4 sn'lik
rAF örneği, iki koşu. Efektler (parçacık patlamaları, FOV vuruşu, CSS geçişleri) ölçülen sınırın
altında: gerileme yok, bloom ve yıldız alanı dokunulmadı. Not: `vendor.spec.js` "vendor/ is exactly what
the script produces" testi Windows'ta (`core.autocrlf=true`, CRLF) `master`'da da kırmızı; Linux CI'da
yeşil. Bu değişiklikten bağımsız.

## 7. Araçlar

- `test/record-reel.js`: ham klip (`?rec=1&debug=1`, kare kare sürülür, ekran görüntüsü → ffmpeg).
- `test/capture-screens.js`: ekran görüntüleri (masaüstü/mobil × EN/TR).
- `?rec=1`: tüm arayüzü gizler (yalnız dünya); `?debug=1` kancasına `manual()`, `step(dt, çiz)`, `world()` eklendi.
