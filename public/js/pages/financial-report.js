// js/pages/financial-report.js
const user = requireAuth(['manager', 'inventory_keeper']);
updateUserDisplay();
initFloatingBell();

let allTransactions = [];

async function loadFinancialReport() {
    try {
        allTransactions = await getFinancialTransactions();
        updateTable(allTransactions);
        calculateTotals(allTransactions);
    } catch (error) {
        alert(error.message);
    }
}

function updateTable(transactions) {
    const tbody = document.getElementById('financialReportBody');
    if (!tbody) return;
    tbody.innerHTML = transactions.map(t => `
        <tr>
            <td data-label="التاريخ">${new Date(t.createdAt).toLocaleDateString('ar-EG')}</td>
            <td data-label="الوصف">${t.description || ''}</td>
            <td data-label="النوع">${t.type === 'income' ? 'إيراد' : 'مصروف'}</td>
            <td data-label="المبلغ">${t.amount}</td>
            <td data-label="المتبرع/المسؤول">${t.donor_name || ''}</td>
            <td data-label="المستفيد">${t.type === 'expense' ? (t.beneficiaryname || '-') : '-'}</td>
            <td data-label="إجراءات">
                ${user.role === 'manager' ? `
                    <button class="btn btn-secondary btn-sm" onclick="editTransaction(${t.id}, ${t.amount}, '${(t.description || '').replace(/'/g, "\\'")}', '${t.type}')">تعديل</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTransaction(${t.id})">حذف</button>
                ` : ''}
              </td>
         </table>
    `).join('');
}

function calculateTotals(transactions) {
    let totalIncome = 0, totalExpenses = 0;
    transactions.forEach(t => {
        if (t.type === 'income') totalIncome += t.amount;
        else totalExpenses += t.amount;
    });
    const totalBalance = totalIncome - totalExpenses;
    document.getElementById('totalIncome').innerText = totalIncome;
    document.getElementById('totalExpenses').innerText = totalExpenses;
    document.getElementById('totalBalance').innerText = totalBalance;
}

function filterByType(type) {
    const filtered = allTransactions.filter(t => t.type === type);
    updateTable(filtered);
}

function showAll() {
    updateTable(allTransactions);
}

function printReport() {
    window.print();
}

function filterFinancial() {
    const search = document.getElementById('searchFinancial').value.toLowerCase();
    const filtered = allTransactions.filter(t => 
        (t.description && t.description.toLowerCase().includes(search)) ||
        (t.donor_name && t.donor_name.toLowerCase().includes(search))
    );
    updateTable(filtered);
}

async function deleteTransaction(id) {
    if (confirm('هل أنت متأكد من حذف هذه المعاملة؟')) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/financial-transactions/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            alert('تم الحذف بنجاح');
            loadFinancialReport();
        } catch (error) {
            alert(error.message);
        }
    }
}

let editId = null;
function editTransaction(id, amount, description, type) {
    editId = id;
    document.getElementById('editAmount').value = amount;
    document.getElementById('editDesc').value = description;
    document.getElementById('editType').value = type;
    document.getElementById('editTransactionModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editTransactionModal').style.display = 'none';
    editId = null;
}

async function updateTransaction() {
    if (!editId) return;
    const amount = parseFloat(document.getElementById('editAmount').value);
    const description = document.getElementById('editDesc').value;
    const type = document.getElementById('editType').value;
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/financial-transactions/${editId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount, description, type })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('تم التعديل بنجاح');
        closeEditModal();
        loadFinancialReport();
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById('editTransactionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateTransaction();
});

document.getElementById('searchFinancial')?.addEventListener('input', filterFinancial);

window.filterByType = filterByType;
window.showAll = showAll;
window.printReport = printReport;
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;
window.closeEditModal = closeEditModal;

loadFinancialReport();