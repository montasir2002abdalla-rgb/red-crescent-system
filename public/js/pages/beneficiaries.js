const user = requireAuth(['employee', 'volunteer', 'manager']);
updateUserDisplay();
initFloatingBell();

let allBeneficiaries = [];

async function loadBeneficiaries() {
    try {
        allBeneficiaries = await getBeneficiaries();
        const tbody = document.getElementById('beneficiariesBody');
        tbody.innerHTML = allBeneficiaries.map(b => `
            <tr>
                <td data-label="الاسم">${b.name}</td>
                <td data-label="رقم الهوية">${b.idNumber}</td>
                <td data-label="الهاتف">${b.phone}</td>
                <td data-label="العنوان">${b.address || ''}</td>
                <td data-label="عدد أفراد الأسرة">${b.familyMembers}</td>
                <td data-label="الولاية">${b.state || ''}</td>
                <td data-label="المحلية">${b.city || ''}</td>
                <td data-label="تاريخ التسجيل">${new Date(b.createdAt).toLocaleDateString('ar-EG')}</td>
                <td data-label="إجراءات">
                    <button class="btn btn-info btn-sm" onclick="showAssistanceLog(${b.id}, '${b.name}')"><i class="fas fa-history"></i> سجل المساعدات</button>
                    ${user.role === 'manager' ? `<button class="btn btn-danger btn-sm" onclick="deleteBeneficiary(${b.id})"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `).join('');
    } catch(e) { alert(e.message); }
}

async function showAssistanceLog(beneficiaryId, beneficiaryName) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/beneficiary-assistance/${beneficiaryId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const logs = await res.json();
    if (!res.ok) return alert(logs.error);
    let html = `<h3>سجل مساعدات المستفيد: ${beneficiaryName}</h3>
                <table class="data-table"><thead><tr><th>التاريخ</th><th>رقم الطلب</th><th>الصنف</th><th>الكمية</th><th>الموظف</th></tr></thead><tbody>`;
    logs.forEach(l => {
        html += `<tr><td>${new Date(l.dispensedAt).toLocaleDateString()}</td><td>${l.request_number || '—'}</td><td>${l.itemName}</td><td>${l.quantity}</td><td>${l.dispensedByName}</td></tr>`;
    });
    html += `</tbody></table>`;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `<div class="modal-content"><span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>${html}</div>`;
    document.body.appendChild(modal);
}

async function deleteBeneficiary(id) {
    if (confirm('هل أنت متأكد من حذف هذا المستفيد؟')) {
        try {
            await deleteBeneficiary(id);
            loadBeneficiaries();
        } catch(e) { alert(e.message); }
    }
}

loadBeneficiaries();