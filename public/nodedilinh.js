document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo bản đồ, view mặc định ở Việt Nam trước khi load dữ liệu
    const map = L.map('map').setView([11.58, 108.0], 11);

    // Sử dụng layer bản đồ OpenStreetMap (vì CSS đã có filter invert cho dark mode)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Custom Icon cho Node
    const nodeIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    // Khởi tạo MarkerClusterGroup giúp hiển thị mượt mà
    const markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 80, // Gom nhóm rộng hơn một chút
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function (cluster) {
            const childMarkers = cluster.getAllChildMarkers();
            const childCount = cluster.getChildCount();

            // Tìm tiền tố (tên trạm chính) phổ biến nhất trong cluster
            const prefixCounts = {};
            let maxCount = 0;
            let mainPrefix = '';

            childMarkers.forEach(marker => {
                const name = marker.options.title || '';
                const parts = name.split('-');

                let prefix = parts[0];
                // Nếu cluster nhỏ hơn 10 trạm và tên có chứa mảng thứ 2 (GN/DN...)
                if (childCount < 10 && parts.length > 1) {
                    prefix = parts[0] + '-' + parts[1];
                }

                prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
                if (prefixCounts[prefix] > maxCount) {
                    maxCount = prefixCounts[prefix];
                    mainPrefix = prefix;
                }
            });

            // Hiển thị tên trạm chính đính kèm với số lượng nhánh bên trong
            return L.divIcon({
                html: `<div class="custom-cluster-label">${mainPrefix} <span style="opacity: 0.7; font-size: 0.75rem;">(${childCount})</span></div>`,
                className: 'custom-cluster-icon',
                iconSize: null // Kéo dãn tự động nội dung
            });
        }
    });

    const loader = document.getElementById('loader');
    const statsCounter = document.getElementById('node-count');

    // UI Search
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    let nodesData = []; // Array to store all parsed nodes

    async function loadKMLData() {
        try {
            // Fetch the KML file from the extracted folder
            const response = await fetch('./extracted_kmz/SITE.kml');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const kmlText = await response.text();

            // Phân tích cú pháp XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(kmlText, "text/xml");

            const placemarks = xmlDoc.getElementsByTagName("Placemark");
            let nodeCount = 0;
            const bounds = [];

            for (let i = 0; i < placemarks.length; i++) {
                const nameTag = placemarks[i].getElementsByTagName("name")[0];
                const pointTag = placemarks[i].getElementsByTagName("Point")[0];

                if (nameTag && pointTag) {
                    const name = nameTag.textContent.trim();
                    const coordinatesTag = pointTag.getElementsByTagName("coordinates")[0];

                    if (coordinatesTag) {
                        const coordsStr = coordinatesTag.textContent.trim();
                        // KML coordinates format: lon,lat,alt
                        const coordsArray = coordsStr.split(',');
                        if (coordsArray.length >= 2) {
                            const lon = parseFloat(coordsArray[0]);
                            const lat = parseFloat(coordsArray[1]);

                            if (!isNaN(lat) && !isNaN(lon)) {
                                nodeCount++;
                                bounds.push([lat, lon]);

                                // Tạo popup HTML
                                const popupContent = `
                                    <div class="popup-title">${name}</div>
                                    <div class="popup-coords">
                                        <span><strong>Lat:</strong> ${lat.toFixed(6)}</span>
                                        <span><strong>Lon:</strong> ${lon.toFixed(6)}</span>
                                    </div>
                                `;

                                // Khởi tạo marker
                                const marker = L.marker([lat, lon], { icon: nodeIcon, title: name })
                                    .bindPopup(popupContent)
                                    .bindTooltip(name, {
                                        permanent: true,
                                        direction: 'right',
                                        className: 'node-label',
                                        offset: [10, 0]
                                    });

                                markers.addLayer(marker);

                                // Lưu trữ vào để tìm kiếm
                                nodesData.push({
                                    name: name,
                                    lat: lat,
                                    lon: lon,
                                    marker: marker
                                });
                            }
                        }
                    }
                }
            }

            // Thêm tất cả cụm marker vào bản đồ
            map.addLayer(markers);

            // Zoom bản đồ vừa với tất cả node
            if (bounds.length > 0) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }

            // Cập nhật giao diện đếm
            statsCounter.innerHTML = `<span style="color:var(--text-muted);font-weight:400">Tổng trạm:</span> ${nodeCount}`;

            // Ẩn màn hình loading với animation mượt
            setTimeout(() => {
                loader.classList.add('hidden');
            }, 600);

        } catch (error) {
            console.error("Lỗi khi tải KML:", error);
            statsCounter.textContent = "Không thể tải dữ liệu";
            loader.innerHTML = `
                <div style="color: #ef4444;text-align:center;">
                    <svg style="width:56px;height:56px;margin:0 auto 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p style="font-size:1.2rem;font-weight:bold;margin-bottom:8px">Lỗi tải bản đồ</p>
                    <p style="color:#94a3b8;font-size:0.95rem;">Bạn hãy mở trang web thông qua Live Server hoặc server cục bộ thay vì file.</p>
                </div>
            `;
        }
    }

    // Xử lý Gõ phím tìm kiếm
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();

        if (!val) {
            searchResults.classList.add('hidden');
            return;
        }

        // Filter maximum 10 items to prevent lag
        const filtered = nodesData.filter(n => n.name.toLowerCase().includes(val)).slice(0, 10);

        if (filtered.length > 0) {
            searchResults.innerHTML = filtered.map(n => `
                <div class="search-result-item" data-lat="${n.lat}" data-lon="${n.lon}" data-name="${n.name}">
                    <span style="color:var(--accent);margin-right:8px">•</span> ${n.name}
                </div>
            `).join('');
            searchResults.classList.remove('hidden');
        } else {
            searchResults.innerHTML = `<div class="search-result-item" style="color:var(--text-muted); cursor:default; font-style:italic;">Không tìm thấy node "${val}"</div>`;
            searchResults.classList.remove('hidden');
        }
    });

    // Ẩn kết quả khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });

    // Click vào item kết quả tìm kiếm để nhảy đến Node
    searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (item && item.dataset.lat) {
            const name = item.dataset.name;
            const nodeData = nodesData.find(n => n.name === name);

            if (nodeData) {
                // Leaflet MarkerCluster support zoom into spiderfy
                markers.zoomToShowLayer(nodeData.marker, () => {
                    nodeData.marker.openPopup();
                });
            }

            searchResults.classList.add('hidden');
            searchInput.value = name;
        }
    });

    // Ngăn chặn form submit nếu bấm Enter trên tìm kiếm
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Tự click vào kết quả đầu tiên nếu có
            const firstChild = searchResults.querySelector('.search-result-item[data-lat]');
            if (firstChild && !searchResults.classList.contains('hidden')) {
                firstChild.click();
            }
        }
    });

    // Bắt đầu tải KML
    loadKMLData();
});
