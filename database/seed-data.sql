-- Demo data. Password for demo user is "demo1234" (bcrypt, cost 10).
INSERT INTO users (id, email, password_hash, full_name, home_address, home_location) VALUES
('00000000-0000-0000-0000-000000000001', 'demo@example.com',
 '$2b$10$eImiTXuWVxfM37uY4JANjQ==PLACEHOLDER', 'Demo Rep', 'Brampton, ON',
 ST_SetSRID(ST_MakePoint(-79.7624, 43.7315), 4326)::geography);

INSERT INTO companies (id, owner_id, company_code, name, address, city, postal_code, province, location) VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','C-001001','Northgate Auto Parts','1 Northgate Blvd','Brampton','L6S 4C6','ON',ST_SetSRID(ST_MakePoint(-79.7300,43.7350),4326)::geography),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','C-001002','Maple Ridge Hardware','245 Queen St E','Brampton','L6W 2B5','ON',ST_SetSRID(ST_MakePoint(-79.7510,43.6960),4326)::geography),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','C-001003','Lakeshore Marine Supply','900 Lakeshore Rd E','Mississauga','L5E 1E2','ON',ST_SetSRID(ST_MakePoint(-79.5700,43.5800),4326)::geography),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','C-001004','Oakville Fleet Services','2200 Speers Rd','Oakville','L6L 2X8','ON',ST_SetSRID(ST_MakePoint(-79.7200,43.4200),4326)::geography),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','C-001005','Guelph Tool & Die','55 Wyndham St N','Guelph','N1H 4E5','ON',ST_SetSRID(ST_MakePoint(-80.2480,43.5450),4326)::geography),
('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','C-001006','Vaughan Industrial Coatings','7777 Weston Rd','Vaughan','L4L 0G9','ON',ST_SetSRID(ST_MakePoint(-79.5500,43.8000),4326)::geography);

INSERT INTO customers (company_id, tier, temperature, last_contact_at, last_purchase_at, annual_value) VALUES
('10000000-0000-0000-0000-000000000001','tier1',NULL, now() - interval '20 days', now() - interval '30 days', 42000),
('10000000-0000-0000-0000-000000000002','tier1',NULL, now() - interval '95 days', now() - interval '100 days', 18500),
('10000000-0000-0000-0000-000000000003','tier2','hot', now() - interval '3 days', NULL, NULL),
('10000000-0000-0000-0000-000000000004','tier2','warm', now() - interval '40 days', NULL, NULL),
('10000000-0000-0000-0000-000000000005','tier3',NULL, now() - interval '400 days', now() - interval '410 days', 9000),
('10000000-0000-0000-0000-000000000006','tier4','cold', now() - interval '10 days', NULL, NULL);

INSERT INTO clients (company_id, client_code, first_name, last_name, title, email, phone, is_primary) VALUES
('10000000-0000-0000-0000-000000000001','C-001001-01','Priya','Sharma','Purchasing Manager','priya@northgate.example','905-555-0101',true),
('10000000-0000-0000-0000-000000000002','C-001002-01','Tom','Reilly','Owner','tom@mapleridge.example','905-555-0102',true),
('10000000-0000-0000-0000-000000000003','C-001003-01','Dana','Whitfield','Operations Lead','dana@lakeshore.example','905-555-0103',true),
('10000000-0000-0000-0000-000000000004','C-001004-01','Marcus','Chen','Fleet Manager','marcus@oakvillefleet.example','905-555-0104',true),
('10000000-0000-0000-0000-000000000005','C-001005-01','Helen','Kowalski','Buyer','helen@guelphtool.example','519-555-0105',true),
('10000000-0000-0000-0000-000000000006','C-001006-01','Raj','Patel','Plant Manager','raj@vaughancoat.example','905-555-0106',true);
