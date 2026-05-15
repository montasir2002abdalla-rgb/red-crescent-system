const user = requireAuth(['manager', 'inventory_keeper']);
updateUserDisplay();
initFloatingBell();

async function loadInventory() {
    try {
        const inventory = await getInventory();
        const tbody = document.getElementById('inventoryBody');
        tbody.innerHTML = inventory.map(item => {
            const available = item.quantity - (item.reserved_quantity || 0);
            return `<tr>
                <td data-label="الاسم">${item.itemName}</td>
                <td data-label="التصنيف">${item.category}</td>
                <td data-label="الكمية">${item.quantity}</td>
                <td data-label="المحجوز">${item.reserved_quantity || 0}</td>
                <td data-label="المتاح">${available}</td>
                <td data-label="الوحدة">${item.unit}</td>
                <td data-label="المستودع">${item.warehouse_id}</td>
                <td data-label="إجراءات">
                    <button class="btn btn-secondary btn-sm" onclick="showUpdateModal(${item.id}, ${item.quantity})">تحديث</button>
                    ${user.role === 'manager' ? `<button class="btn btn-danger btn-sm" onclick="handleDeleteItem(${item.id})"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');
    } catch(e) { alert(e.message); }
}

function showAddItemModal() { document.getElementById('addItemModal').style.display = 'flex'; }
function closeModal() { document.getElementById('addItemModal').style.display = 'none'; }
function showUpdateModal(id, qty) { document.getElementById('updateItemId').value = id; document.getElementById('newQuantity').value = qty; document.getElementById('updateQuantityModal').style.display = 'flex'; }
function closeUpdateModal() { document.getElementById('updateQuantityModal').style.display = 'none'; }
async function handleDeleteItem(id) {
    if (confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        try {
            await deleteInventoryItem(id);
            loadInventory();
        } catch(e) { alert(e.message); }
    }
}

document.getElementById('addItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = {
        itemName: document.getElementById('itemName').value,
        category: document.getElementById('category').value,
        subCategory: document.getElementById('subCategory')?.value || null,
        quantity: parseInt(document.getElementById('quantity').value),
        unit: document.getElementById('unit').value,
        expiryDate: document.getElementById('expiryDate')?.value || null,
        minStock: parseInt(document.getElementById('minStock').value),
        warehouse_id: document.getElementById('warehouse_id').value
    };
    try {
        await addInventoryItem(item);
        closeModal();
        loadInventory();
    } catch(e) { alert(e.message); }
});

document.getElementById('updateQuantityForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('updateItemId').value;
    const quantity = parseInt(document.getElementById('newQuantity').value);
    try {
        await updateInventoryItem(id, quantity);
        closeUpdateModal();
        loadInventory();
        // التحقق من نقص المخزون بعد التحديث
        const token = localStorage.getItem('token');
        await fetch('/api/check-low-stock', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    } catch(e) { alert(e.message); }
});

loadInventory();