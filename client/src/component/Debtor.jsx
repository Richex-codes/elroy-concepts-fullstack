import {useState, useEffect, useRef} from "react"
import api from "../api/axios.js";
import { getOwnBranchId } from "../utils/authUser.js";
import ErrorBanner from "./ErrorBanner.jsx";
import { useApiError } from "../utils/useApiError.js";
import "../styles/Debtors.css"

const formatNaira = (value) =>
  `₦${(Number(value) || 0).toLocaleString("en-NG")}`;

export default function DebtorPage(){
    const { error, showError, clearError } = useApiError();

    const [debtors, setDebtors] = useState([]);
    const [branches, setBranches] = useState([]);

    const [customerSearch, setCustomerSearch] = useState("");
    // Branch admins land here already filtered to their own branch; they can
    // still switch to "All Branches" or another one from the dropdown.
    const [selectedBranch, setSelectedBranch] = useState(getOwnBranchId);

    const [fromDate, setFromDate] = useState("");

    const [toDate, setToDate] = useState("");

    const [loading, setLoading] = useState(true);
    const latestRequestId = useRef(0);

    const fetchBranches = async () => {
        try {
            const res = await api.get("/admin/branches", {
                headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            setBranches(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchDebtors = async () => {
        setLoading(true);
        const requestId = ++latestRequestId.current;
        try {
            const res = await api.get(
            "/admin/debtors",
            {
                params: {
                customerName: customerSearch,
                branch: selectedBranch,
                fromDate,
                toDate,
                },
                headers: {
                Authorization: `Bearer ${localStorage.getItem(
                    "token"
                )}`,
                },
            }
            );

            if (requestId !== latestRequestId.current) return;
            clearError();
            setDebtors(res.data);
        } catch (err) {
            console.error(err);
            if (requestId === latestRequestId.current) {
                showError(err, "Failed to load debtors.");
                setDebtors([]);
            }
        } finally {
            if (requestId === latestRequestId.current) setLoading(false);
        }
    };

    const clearDebtors = async (id) => {
        try {
            await api.patch(
            `/admin/debtors/${id}`,
            {}, // request body
            {
                headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            }
            );

            fetchDebtors();
        } catch (err) {
            console.error(err);
            showError(err, "Failed to clear this debtor.");
        }
    };


    useEffect(() => {
      fetchBranches();
      fetchDebtors();
    }, []);

    return(
        <div className="debtors-page">
            <h1>Debtors</h1>
            <p className="debtors-page-subtitle">
              Every outstanding balance, regardless of how old the sale is — this list is never limited by year.
            </p>
            <ErrorBanner message={error} onDismiss={clearError} />
            <div className="debtor-filters">
                <input
                    type="text"
                    placeholder="Customer Name"
                    value={customerSearch}
                    onChange={(e) =>
                    setCustomerSearch(
                        e.target.value
                    )
                    }
                />

                <select
                    value={selectedBranch}
                    onChange={(e) =>
                    setSelectedBranch(e.target.value)
                    }
                >
                    <option value="">All Branches</option>

                    {branches.map((branch) => (
                    <option
                        key={branch._id}
                        value={branch._id}
                    >
                        {branch.name}
                    </option>
                    ))}
                </select>

                <input
                    type="date"
                    value={fromDate}
                    onChange={(e) =>
                    setFromDate(
                        e.target.value
                    )
                    }
                />

                <input
                    type="date"
                    value={toDate}
                    onChange={(e) =>
                    setToDate(
                        e.target.value
                    )
                    }
                />

                <button onClick={fetchDebtors}>
                    Search
                </button>
                </div>

                <div className="debtor-table-container">
                    <table className="debtors-table">
                        <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Branch</th>
                            <th className="col-right">Amount</th>
                            <th className="col-right">Paid</th>
                            <th className="col-right">Balance</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                        </thead>

                        <tbody>
                        {loading && debtors.length === 0 && (
                          <tr>
                            <td colSpan={8} className="table-empty-state">
                              Loading debtors...
                            </td>
                          </tr>
                        )}
                        {!loading && debtors.length === 0 && (
                          <tr>
                            <td colSpan={8} className="table-empty-state">
                              No outstanding debtors found.
                            </td>
                          </tr>
                        )}
                        {debtors.map((debtor, idx) => (
                            <tr key={debtor._id} className={idx % 2 === 1 ? "row-alt" : ""}>
                            <td data-label="Customer">
                                {debtor.customerName}
                            </td>

                            <td data-label="Items">
                                {debtor.items
                                  ?.map(
                                    (item) =>
                                      `${item.product?.name || "Deleted product"} (${item.color})${item.quantitySold > 1 ? ` x${item.quantitySold}` : ""}`
                                  )
                                  .join(", ")}
                            </td>

                            <td data-label="Branch">
                                {debtor.branch?.name}
                            </td>

                            <td className="amount-cell" data-label="Amount">
                                {formatNaira(debtor.amount)}
                            </td>

                            <td className="amount-cell" data-label="Paid">
                                {formatNaira(debtor.amountPaid)}
                            </td>

                            <td className="amount-cell balance-cell" data-label="Balance">
                                {formatNaira(debtor.balance)}
                            </td>

                            <td data-label="Date">
                                {new Date(
                                debtor.saleDate
                                ).toLocaleDateString()}
                            </td>

                            <td data-label="Action">
                                <button
                                className="clear-btn"
                                onClick={() =>
                                    clearDebtors(
                                    debtor._id
                                    )
                                }
                                >
                                Clear
                                </button> 
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>

        </div>
    )

}