/*
 * Günlük Meydan Okuma'nın belirlenimli çekirdeği.
 *
 * Bu dosya `script.js`ten ayrı duruyor, çünkü test edilebilmesi gereken tek
 * parça burası ve `script.js` içinde test edilemiyordu: o modül en üst
 * seviyede Three.js'e ve DOM'a dokunuyor, yani onu içe aktarmak bir tarayıcı
 * istiyor. Sonuç olarak `test/prng.spec.js` uzun süre bu fonksiyonların bir
 * KOPYASINI sınadı ve dosyanın başında "script.js'i değiştirirsen burayı da
 * değiştir" yazıyordu.
 *
 * Bu bir sınama değil, bir dilek. Kopya, aslından sessizce ayrılabilir: RNG
 * değişir, testler yeşil kalır, ve aynı günde oynayan iki oyuncu farklı
 * dizilerle oynarken skor tablosu hâlâ karşılaştırılabilir görünür. Günlük
 * modun tek vaadi tam olarak buydu.
 *
 * Burada DOM yok, Three yok, yan etki yok - sadece saf fonksiyonlar. Böylece
 * oyunun yüklediği dosyanın ta kendisi Node'dan da içe aktarılabiliyor, ve
 * test artık kopyayı değil gönderilen kodu ölçüyor.
 */

/** Küçük, hızlı, tohumlanabilir üreteç (mulberry32). [0, 1) aralığı. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Takvim günü, UTC'ye göre: `20260831`.
 *
 * UTC, yerel saat değil - iki oyuncunun "aynı gün" oynamış sayılması için
 * ortak bir gün tanımı gerekiyor ve yerel gün sınırı saat dilimine göre
 * kayıyor.
 */
export function todayUTCStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** O günün tohumu. Örn. 20260831. */
export function dailySeed(date = new Date()) {
  return Number(todayUTCStamp(date));
}

/** O güne ait en iyi skorun saklandığı anahtar. */
export function dailyStorageKey(date = new Date()) {
  return `novaDriftDaily-${todayUTCStamp(date)}`;
}
