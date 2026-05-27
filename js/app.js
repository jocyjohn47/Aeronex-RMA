
/* ADD THIS ABOVE <h3>Review Items</h3> */

<label>Remarks</label>
<textarea id="spareRemarks"
  placeholder="Optional remarks for this spare order"
  style="min-height:80px"></textarea>

/* THEN inside submitOrder() payload add: */

remarks: ($('spareRemarks')&&$('spareRemarks').value?$('spareRemarks').value.trim():'')
