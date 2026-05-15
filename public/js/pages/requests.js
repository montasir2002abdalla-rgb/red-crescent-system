const user = requireAuth();
updateUserDisplay();
initFloatingBell();

let currentBeneficiaryId = null;
async function getBeneficiaryIdFromUser() {
    if (user.role === 'beneficiary') {
        const beneficiaries = await getBeneficiaries();
        const ben = beneficiaries.find(b => b.userId === user.id);
        if (ben) currentBeneficiaryId = ben.id;
    }
}

async function loadRequests() {
    try {
        const requests = await getAssistanceRequests();
        const tbody = document.getElementById('requestsBody');
        if (!tbody) return;
        let filtered = requests;
        if (user.role === 'beneficiary') {
            if (!currentBeneficiaryId) await getBeneficiaryIdFromUser();
            filtered = requests.filter(r => r.beneficiaryId === currentBeneficiaryId);
        }
        tbody.innerHTML = filtered.map(r => `
            <tr>
                <td data-label="المستفيد">${r.beneficiaryName || 'غير معروف'}</td>
                <td data-label="رقم الطلب">${r.request_number || '—'}</td>
                <td data-label="نوع الطلب">${r.requestType}</td>
                <td data-label="الوصف">${r.description.substring(0,50)}...</td>
                <td data-label="الحالة"><span class="status ${r.status}">${r.status === 'pending' ? 'معلق' : r.status === 'approved' ? 'معتمد' : r.status === 'completed' ? 'مكتمل' : 'مرفوض'}</span></td>
                <td data-label="التاريخ">${new Date(r.createdAt).toLocaleDateString('ar-EG')}</td>
            </tr>
        `).join('');
    } catch(e) { alert(e.message); }
}

async function loadBeneficiariesForSelect() {
    try {
        const beneficiaries = await getBeneficiaries();
        const select = document.getElementById('requestBeneficiaryId');
        if (!select) return;
        select.innerHTML = '<option value="">اختر...</option>';
        beneficiaries.forEach(b => { select.innerHTML += `<option value="${b.id}">${b.name} (${b.idNumber})</option>`; });
    } catch(e) { alert(e.message); }
}

function showAddRequestModal() {
    if (user.role === 'beneficiary') document.getElementById('beneficiarySelectGroup').style.display = 'none';
    else { document.getElementById('beneficiarySelectGroup').style.display = 'block'; loadBeneficiariesForSelect(); }
    document.getElementById('addRequestModal').style.display = 'flex';
}

function closeModal() { document.getElementById('addRequestModal').style.display = 'none'; }

document.getElementById('addRequestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    let beneficiaryId;
    if (user.role === 'beneficiary') {
        if (!currentBeneficiaryId) { alert('لم يتم العثور على معرف المستفيد'); return; }
        beneficiaryId = currentBeneficiaryId;
    } else {
        beneficiaryId = document.getElementById('requestBeneficiaryId').value;
        if (!beneficiaryId) { alert('الرجاء اختيار مستفيد'); return; }
    }
    const requestType = document.getElementById('requestType').value;
    const description = document.getElementById('requestDescription').value;
    
    if (requestType !== 'financial') {
        const categoryMap = { food: 'food', medical: 'medical', shelter: 'shelter', other: 'other' };
        const category = categoryMap[requestType] || 'other';
        try {
            const available = await getAvailableInventory();
            const categoryItem = available.find(i => i.category === category && i.available_quantity > 0);
            if (!categoryItem) { alert(`نعتذر، لا يوجد مخزون متاح حالياً للمساعدات من نوع ${requestType}.`); return; }
            const qty = prompt(`يتوفر ${categoryItem.available_quantity} من "${categoryItem.itemName}". كم تريد طلب؟ (الحد الأقصى ${categoryItem.available_quantity})`, "1");
            if (!qty || parseInt(qty) <= 0) return;
            const finalQty = Math.min(parseInt(qty), categoryItem.available_quantity);
            const result = await createAssistanceRequest({ beneficiaryId, requestType, description, quantity: finalQty });
            alert(result.message);
            closeModal();
            loadRequests();
        } catch(e) { alert(e.message); }
    } else {
        try {
            const result = await createAssistanceRequest({ beneficiaryId, requestType, description, quantity: 1 });
            alert(result.message);
            closeModal();
            loadRequests();
        } catch(e) { alert(e.message); }
    }
});

getBeneficiaryIdFromUser().then(() => loadRequests());