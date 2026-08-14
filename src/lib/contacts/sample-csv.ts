/**
 * Generates a sample CSV string with 50 realistic contacts
 * demonstrating every supported column: phone, name, email, company, tags.
 *
 * Used by the Import Modal's "Download sample" button so users
 * see the exact format before preparing their own file.
 */

const SAMPLE_CONTACTS = [
  { phone: '+919876543210', name: 'Aarav Sharma', email: 'aarav.sharma@gmail.com', company: 'TechVista Solutions', tags: 'Lead, Premium' },
  { phone: '+919812345678', name: 'Priya Patel', email: 'priya.patel@outlook.com', company: 'GreenLeaf Organics', tags: 'Customer' },
  { phone: '+14155552671', name: 'James Wilson', email: 'james.wilson@yahoo.com', company: 'Pacific Trading Co', tags: 'Lead' },
  { phone: '+447911123456', name: 'Sophie Turner', email: 'sophie.t@hotmail.com', company: 'Bright Ideas Ltd', tags: 'VIP, Customer' },
  { phone: '+919998887776', name: 'Rahul Verma', email: 'rahul.verma@techcorp.in', company: 'DataSync India', tags: 'Lead, Hot' },
  { phone: '+12125551234', name: 'Emily Johnson', email: 'emily.j@gmail.com', company: 'Metro Design Studio', tags: 'Customer' },
  { phone: '+919654321098', name: 'Ananya Singh', email: 'ananya.s@yahoo.in', company: 'StyleHub Fashion', tags: 'Prospect' },
  { phone: '+61412345678', name: 'Liam Brown', email: 'liam.brown@outlook.com.au', company: 'Outback Solutions', tags: 'Lead' },
  { phone: '+919876012345', name: 'Vikram Mehta', email: 'vikram.m@infosys.com', company: 'CloudNine Tech', tags: 'Customer, Enterprise' },
  { phone: '+971501234567', name: 'Fatima Al-Rashid', email: 'fatima.r@emirates.ae', company: 'Desert Bloom Trading', tags: 'VIP' },
  { phone: '+919543216789', name: 'Deepika Nair', email: 'deepika.n@gmail.com', company: 'Kerala Spices Export', tags: 'Lead' },
  { phone: '+33612345678', name: 'Pierre Dubois', email: 'pierre.d@orange.fr', company: 'Maison Lumière', tags: 'Customer' },
  { phone: '+919087654321', name: 'Arjun Reddy', email: 'arjun.reddy@wipro.com', company: 'NexGen Solutions', tags: 'Hot, Lead' },
  { phone: '+8613912345678', name: 'Wei Chen', email: 'wei.chen@alibaba.com', company: 'Golden Dragon Import', tags: 'Prospect' },
  { phone: '+919321654987', name: 'Meera Joshi', email: 'meera.j@tcs.com', company: 'Innovate Labs', tags: 'Customer' },
  { phone: '+15551234567', name: 'Michael Davis', email: 'michael.d@protonmail.com', company: 'Sunrise Logistics', tags: 'Lead, Warm' },
  { phone: '+919765432109', name: 'Sanjay Kumar', email: 'sanjay.k@hcl.com', company: 'SmartBuild Infra', tags: 'Enterprise' },
  { phone: '+5511987654321', name: 'Ana Silva', email: 'ana.silva@uol.com.br', company: 'Carnaval Media', tags: 'Customer' },
  { phone: '+919876501234', name: 'Kavitha Raman', email: 'kavitha.r@zoho.com', company: 'FinTrack Analytics', tags: 'VIP, Customer' },
  { phone: '+81901234567', name: 'Yuki Tanaka', email: 'yuki.t@softbank.jp', company: 'Sakura Innovations', tags: 'Lead' },
  { phone: '+919234567890', name: 'Rohit Gupta', email: 'rohit.g@gmail.com', company: 'QuickServe Foods', tags: 'Customer' },
  { phone: '+49151234567', name: 'Hans Mueller', email: 'hans.m@gmx.de', company: 'Precision Tools GmbH', tags: 'Lead, Premium' },
  { phone: '+919345678901', name: 'Shreya Desai', email: 'shreya.d@outlook.com', company: 'CraftWorks Studio', tags: 'Prospect' },
  { phone: '+27821234567', name: 'Thabo Molefe', email: 'thabo.m@vodacom.co.za', company: 'Safari Adventures', tags: 'Customer' },
  { phone: '+919456789012', name: 'Karthik Subramanian', email: 'karthik.s@mindtree.com', company: 'OceanView Resorts', tags: 'VIP' },
  { phone: '+34612345678', name: 'Maria Garcia', email: 'maria.g@telefonica.es', company: 'Sol y Mar Travels', tags: 'Lead' },
  { phone: '+919567890123', name: 'Neha Agarwal', email: 'neha.a@flipkart.com', company: 'UrbanNest Interiors', tags: 'Customer, Hot' },
  { phone: '+82101234567', name: 'Min-Jun Park', email: 'minjun.p@samsung.kr', company: 'HanTech Systems', tags: 'Enterprise' },
  { phone: '+919678901234', name: 'Aditya Bose', email: 'aditya.b@tatamotors.com', company: 'EastWind Logistics', tags: 'Lead' },
  { phone: '+6281234567890', name: 'Siti Rahma', email: 'siti.r@tokopedia.id', company: 'Batik Heritage', tags: 'Customer' },
  { phone: '+919789012345', name: 'Pooja Malhotra', email: 'pooja.m@paytm.com', company: 'Sparkle Jewellers', tags: 'VIP, Premium' },
  { phone: '+393312345678', name: 'Marco Rossi', email: 'marco.r@libero.it', company: 'Dolce Vita Café', tags: 'Customer' },
  { phone: '+919890123456', name: 'Suresh Iyer', email: 'suresh.i@cognizant.com', company: 'BrightPath Education', tags: 'Lead' },
  { phone: '+60121234567', name: 'Ahmad Zaidi', email: 'ahmad.z@maybank.my', company: 'Nusantara Trading', tags: 'Prospect' },
  { phone: '+919012345678', name: 'Ritu Saxena', email: 'ritu.s@infosys.com', company: 'MediCare Plus', tags: 'Customer' },
  { phone: '+16045551234', name: 'Sarah Thompson', email: 'sarah.t@rogers.ca', company: 'Maple Leaf Design', tags: 'Lead, Warm' },
  { phone: '+919123456780', name: 'Manish Pandey', email: 'manish.p@razorpay.com', company: 'PayEase Solutions', tags: 'Enterprise, VIP' },
  { phone: '+254712345678', name: 'Grace Wanjiku', email: 'grace.w@safaricom.ke', company: 'Savanna Exports', tags: 'Customer' },
  { phone: '+919234567801', name: 'Divya Krishnan', email: 'divya.k@freshworks.com', company: 'GreenGrow Farms', tags: 'Lead' },
  { phone: '+48501234567', name: 'Piotr Kowalski', email: 'piotr.k@wp.pl', company: 'Baltic Software', tags: 'Prospect' },
  { phone: '+919345678012', name: 'Amit Choudhary', email: 'amit.c@ola.com', company: 'RideWell Transport', tags: 'Customer' },
  { phone: '+66812345678', name: 'Somchai Kittisak', email: 'somchai.k@truecorp.th', company: 'Siam Fresh Market', tags: 'Lead' },
  { phone: '+919456780123', name: 'Lakshmi Venkatesh', email: 'lakshmi.v@biocon.com', company: 'AyurVeda Wellness', tags: 'VIP, Customer' },
  { phone: '+351912345678', name: 'João Ferreira', email: 'joao.f@sapo.pt', company: 'Lisbon Crafts', tags: 'Prospect' },
  { phone: '+919567801234', name: 'Rajesh Pillai', email: 'rajesh.p@mahindra.com', company: 'CoastLine Shipping', tags: 'Enterprise' },
  { phone: '+84901234567', name: 'Nguyen Minh', email: 'minh.n@viettel.vn', company: 'Hanoi Textiles', tags: 'Customer' },
  { phone: '+919678012345', name: 'Swati Bhatt', email: 'swati.b@zomato.com', company: 'SpiceRoute Kitchen', tags: 'Lead, Hot' },
  { phone: '+234801234567', name: 'Chukwu Okafor', email: 'chukwu.o@gtbank.ng', company: 'Lagos Digital Hub', tags: 'Customer' },
  { phone: '+919789123456', name: 'Nitin Saxena', email: 'nitin.s@reliance.com', company: 'PowerGrid Energy', tags: 'VIP' },
  { phone: '+41791234567', name: 'Laura Brunner', email: 'laura.b@swisscom.ch', company: 'Alpine Solutions AG', tags: 'Lead, Premium' },
] as const;

/** Build and return a CSV string ready for download. */
export function generateSampleCsv(): string {
  const header = 'phone,name,email,company,tags';
  const rows = SAMPLE_CONTACTS.map((c) => {
    // Quote tags since they contain commas
    const tags = c.tags.includes(',') ? `"${c.tags}"` : c.tags;
    return `${c.phone},${c.name},${c.email},${c.company},${tags}`;
  });
  return [header, ...rows].join('\n');
}

/** Trigger a browser download of the sample CSV. */
export function downloadSampleCsv(): void {
  const csv = generateSampleCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample-contacts.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
