function formatRepairDate(v){
  if(!v) return '';

  // Handle Lark timestamp
  if(typeof v === 'number' || /^\d+$/.test(String(v))){
    const d = new Date(Number(v));

    return d.toLocaleDateString('en-GB',{
      day:'2-digit',
      month:'short',
      year:'numeric'
    });
  }

  return v;
}

function renderRepairStatus(){

  $('repairStatus').innerHTML=`
  <div class="panel">

    <h2>
      Repair Status
      <button class="btn-light" onclick="refreshRepairs()">
        Refresh
      </button>
    </h2>

    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>Repair Case No</th>
            <th>Dealer / Company</th>
            <th>Model No</th>
            <th>Serial No</th>
            <th>Date</th>
            <th>Status</th>
            <th>Log Link</th>
            <th>Issue Media / Required Details</th>
            <th>Remarks</th>
            <th>Notes</th>
          </tr>
        </thead>

        <tbody>

          ${(Array.isArray(S.repairs)?S.repairs:[]).map(r=>{

            let f=r.fields||{};

            return `
            <tr>

              <td>
                ${esc(f['REPAIR CASE']||f['Repair Case']||'')}
              </td>

              <td>
                ${esc(f['Company Name']||f['Dealer Name']||'')}
              </td>

              <td>
                ${esc(f['Model No']||'')}
              </td>

              <td>
                ${esc(f['Serial No']||'')}
              </td>

              <td>
                ${esc(
                  formatRepairDate(
                    f['Date of Purchase / Activation date']
                    || f['Date Of Activation']
                    || ''
                  )
                )}
              </td>

              <td>
                ${statusCell(r,'repair')}
              </td>

              <td>
                ${linkCell(
                  f['Log File']
                  || f['Log for Drone and RC']
                )}
              </td>

              <td>
                ${linkCell(
                  f['Upload all the required details']
                  || f['Issue Video and Pictures']
                )}
              </td>

              <td>
                ${esc(f['Remarks']||'')}
              </td>

              <td>
                ${esc(f['Notes']||'')}
              </td>

            </tr>
            `;

          }).join('')}

        </tbody>

      </table>

    </div>

  </div>
  `;
}
