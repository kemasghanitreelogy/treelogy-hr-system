-- Kategori aset tetap baru untuk inventaris:
-- tanah, bangunan (permanen/non-permanen), aset biologis, peralatan kantor.
-- Kendaraan & mesin sudah ada sejak 0043.
alter type inventory_category_t add value if not exists 'tanah';
alter type inventory_category_t add value if not exists 'bangunan_permanen';
alter type inventory_category_t add value if not exists 'bangunan_non_permanen';
alter type inventory_category_t add value if not exists 'aset_biologis';
alter type inventory_category_t add value if not exists 'peralatan_kantor';
