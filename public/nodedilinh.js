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
    let currentHighlightedMarker = null; // Marker đang được tìm kiếm để giữ lại trên bản đồ

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
                                    <div class="popup-coords" style="margin-bottom: 8px;">
                                        <span><strong>Lat:</strong> ${lat.toFixed(6)}</span>
                                        <span><strong>Lon:</strong> ${lon.toFixed(6)}</span>
                                    </div>
                                    <button class="copy-coords-btn" onclick="copyNodeCoords('${lat.toFixed(6)}, ${lon.toFixed(6)}', this)" style="width: 100%; padding: 6px; background-color: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-family: inherit; transition: background-color 0.2s;">
                                        Copy Tọa độ
                                    </button>
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
                // Nếu có marker highlight trước đó, thì đưa nó về lại cluster group
                if (currentHighlightedMarker && currentHighlightedMarker !== nodeData.marker) {
                    map.removeLayer(currentHighlightedMarker);
                    markers.addLayer(currentHighlightedMarker);
                }

                currentHighlightedMarker = nodeData.marker;

                // Tách marker được chọn khỏi cluster và thêm trực tiếp vào map 
                // để nó luôn hiển thị (không bị gom nhóm) ngay cả khi zoom out
                markers.removeLayer(nodeData.marker);
                map.addLayer(nodeData.marker);

                // Di chuyển bản đồ đến vị trí node và mở popup
                map.setView([nodeData.lat, nodeData.lon], 16);
                nodeData.marker.openPopup();
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

    // Tính năng tìm node gần nhất
    const findNearestBtn = document.getElementById('find-nearest-btn');
    let userLocationMarker = null;
    let nearestRoutingLine = null;

    if (findNearestBtn) {
        findNearestBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert('Trình duyệt của bạn không hỗ trợ định vị.');
                return;
            }

            // Hiển thị trạng thái đang tìm kiếm
            const originalHTML = findNearestBtn.innerHTML;
            findNearestBtn.innerHTML = '<span style="display:inline-block; width:14px; height:14px; border:2px solid; border-radius:50%; border-top-color:transparent; animation:spin 1s linear infinite;"></span> Đang tìm...';

            // Xóa style animation cũ nếu có để tránh lỗi
            if (!document.getElementById('spin-anim-style')) {
                const style = document.createElement('style');
                style.id = 'spin-anim-style';
                style.innerHTML = '@keyframes spin { 100% { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            navigator.geolocation.getCurrentPosition((position) => {
                findNearestBtn.innerHTML = originalHTML;

                if (nodesData.length === 0) {
                    alert('Chưa tải xong dữ liệu trạm.');
                    return;
                }

                const userLat = position.coords.latitude;
                const userLon = position.coords.longitude;
                const userLatLng = L.latLng(userLat, userLon);

                // Xóa marker vị trí cũ và đường vẽ cũ (nếu có)
                if (userLocationMarker) map.removeLayer(userLocationMarker);
                if (nearestRoutingLine) map.removeLayer(nearestRoutingLine);

                // Hiển thị vị trí người dùng bằng icon vòng tròn đơn giản
                userLocationMarker = L.circleMarker([userLat, userLon], {
                    radius: 8,
                    fillColor: "#3b82f6",
                    color: "#ffffff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1
                }).bindPopup("<div class='popup-title'>Vị trí của bạn</div>").addTo(map);

                // Tìm node gần nhất
                let nearestNode = null;
                let minDistance = Infinity;

                nodesData.forEach(node => {
                    const nodeLatLng = L.latLng(node.lat, node.lon);
                    const distance = userLatLng.distanceTo(nodeLatLng); // Tính bằng mét (Leaflet)
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestNode = node;
                    }
                });

                if (nearestNode) {
                    // Vẽ đường nối từ người dùng đến trạm gần nhất
                    nearestRoutingLine = L.polyline([userLatLng, [nearestNode.lat, nearestNode.lon]], {
                        color: '#ea580c',
                        weight: 3,
                        dashArray: '8, 8'
                    }).addTo(map);

                    // Xử lý để always show marker (tách khỏi cluster)
                    if (currentHighlightedMarker && currentHighlightedMarker !== nearestNode.marker) {
                        map.removeLayer(currentHighlightedMarker);
                        markers.addLayer(currentHighlightedMarker);
                    }
                    currentHighlightedMarker = nearestNode.marker;
                    markers.removeLayer(nearestNode.marker);
                    map.addLayer(nearestNode.marker);

                    // Phóng to bản đồ để bao trọn cả 2 vị trí
                    const bounds = L.latLngBounds([userLatLng, [nearestNode.lat, nearestNode.lon]]);
                    map.fitBounds(bounds, { padding: [50, 50] });

                    // Cập nhật popup với thông tin khoảng cách
                    nearestNode.marker.setPopupContent(`
                        <div class="popup-title">${nearestNode.name}</div>
                        <div class="popup-coords" style="margin-bottom: 8px;">
                            <div style="color: #ea580c; font-weight: bold; margin-bottom: 4px; font-size: 0.9rem;">📍 Cách bạn: ${(minDistance / 1000).toFixed(2)} km</div>
                            <span><strong>Lat:</strong> ${nearestNode.lat.toFixed(6)}</span>
                            <span><strong>Lon:</strong> ${nearestNode.lon.toFixed(6)}</span>
                        </div>
                        <button class="copy-coords-btn" onclick="copyNodeCoords('${nearestNode.lat.toFixed(6)}, ${nearestNode.lon.toFixed(6)}', this)" style="width: 100%; padding: 6px; background-color: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-family: inherit; transition: background-color 0.2s;">
                            Copy Tọa độ
                        </button>
                    `).openPopup();
                }

            }, (error) => {
                console.error("Lỗi lấy vị trí:", error);
                findNearestBtn.innerHTML = originalHTML;

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        alert("Bạn đã từ chối cấp quyền truy cập vị trí. Để sử dụng tính năng này, hãy cấp quyền vị trí cho trang web.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        alert("Thông tin vị trí hiện không có sẵn.");
                        break;
                    case error.TIMEOUT:
                        alert("Yêu cầu lấy vị trí quá thời gian chờ.");
                        break;
                    default:
                        alert("Đã xảy ra lỗi không xác định khi lấy vị trí.");
                        break;
                }
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
    }

    // Bắt đầu tải KML
    loadKMLData();
});

// Hàm hỗ trợ copy tọa độ
window.copyNodeCoords = function (coords, btn) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(coords).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Đã copy!';
            btn.style.backgroundColor = '#10b981'; // Green
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = 'var(--accent)';
            }, 2000);
        }).catch(err => {
            console.error('Lỗi copy:', err);
            alert('Lỗi khi copy tọa độ!');
        });
    } else {
        // Fallback
        const tempInput = document.createElement('input');
        tempInput.value = coords;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);

        const originalText = btn.innerHTML;
        btn.innerHTML = 'Đã copy!';
        btn.style.backgroundColor = '#10b981'; // Green
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = 'var(--accent)';
        }, 2000);
    }
};
