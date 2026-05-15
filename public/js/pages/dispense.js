const user = requireAuth(['manager', 'inventory_keeper']);
updateUserDisplay();
initFloatingBell();

let inventoryItems = [];

async function loadInventory() {
    try {
        inventoryItems = await getAvailableInventory();
        const select = document.getElementById('itemId');
        select.innerHTML = '<option value="">اختر الصنف...</option>';
        inventoryItems.forEach(item => {
            if (item.available_quantity > 0) {
                select.innerHTML += `<option value="${item.id}">${item.itemName} (متاح: ${item.available_quantity})</option>`;
            }
        });
    } catch(e) { alert(e.message); }
}

document.getElementById('requestNumber').addEventListener('change', async function() {
    const requestNumber = this.value;
    if (!requestNumber) return;
    try {
        const allRequests = await getAssistanceRequests();
        const req = allRequests.find(r => r.request_number == requestNumber);
        if (!req) throw new Error('لا يوجد طلب بهذا الرقم');
        if (req.status !== 'approved') throw new Error('الطلب غير معتمد بعد');
        document.getElementById('requestInfo').innerHTML = `
            <div class="alert alert-info">
                <strong>المستفيد:</strong> ${req.beneficiaryName}<br>
                <strong>النوع:</strong> ${req.requestType}<br>
                <strong>الكمية المطلوبة:</strong> ${req.quantity || 1}<br>
                <strong>الحالة:</strong> ${req.status}<br>
                <strong>رقم الطلب:</strong> ${req.request_number}
            </div>`;
        // محاولة تحديد الصنف المناسب حسب التصنيف
        const categoryMap = { food: 'food', medical: 'medical', shelter: 'shelter', other: 'other' };
        const cat = categoryMap[req.requestType] || 'other';
        const suitableItem = inventoryItems.find(i => i.category === cat && i.available_quantity >= req.quantity);
        if (suitableItem) {
            document.getElementById('itemId').value = suitableItem.id;
            document.getElementById('quantity').value = req.quantity;
        }
    } catch(e) { alert(e.message); }
});

document.getElementById('dispenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const requestNumber = parseInt(document.getElementById('requestNumber').value);
    const itemId = parseInt(document.getElementById('itemId').value);
    const quantity = parseInt(document.getElementById('quantity').value);
    const allRequests = await getAssistanceRequests();
    const req = allRequests.find(r => r.request_number == requestNumber);
    if (!req) return alert('الطلب غير موجود');
    const data = { requestId: req.id, itemId, quantity };
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/dispense', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        alert('تم الصرف بنجاح');
        document.getElementById('dispenseForm').reset();
        document.getElementById('requestInfo').innerHTML = '';
        loadInventory();
    } catch(e) { alert(e.message); }
});

async function printReceiptForRequest() {
    const requestNumber = document.getElementById('printRequestNumber').value;
    if (!requestNumber) return alert('أدخل رقم الطلب');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/receipt-by-request/${requestNumber}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        window.open(data.receiptUrl, '_blank');
    } catch(e) { alert(e.message); }
}

window.printReceiptForRequest = printReceiptForRequest;
loadInventory();