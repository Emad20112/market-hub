


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'owner',
    'manager',
    'accountant',
    'cashier',
    'warehouse'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'confirmed',
    'paid',
    'partial',
    'cancelled',
    'returned',
    'received',
    'completed',
    'unpaid'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."movement_type" AS ENUM (
    'purchase',
    'sale',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'return_in',
    'return_out',
    'opening',
    'purchase_return',
    'sale_return'
);


ALTER TYPE "public"."movement_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'cash',
    'card',
    'bank_transfer',
    'credit',
    'mobile_money'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_loyalty"("_customer" "uuid", "_points" numeric, "_kind" "text", "_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id UUID; v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _kind NOT IN ('earn','redeem','adjust') THEN RAISE EXCEPTION 'Invalid kind'; END IF;

  INSERT INTO public.loyalty_transactions(customer_id, points, kind, note, created_by)
  VALUES (_customer, _points, _kind, _note, v_user)
  RETURNING id INTO v_id;

  UPDATE public.customers
    SET loyalty_points = GREATEST(loyalty_points + (CASE WHEN _kind='redeem' THEN -ABS(_points) ELSE ABS(_points) END), 0),
        updated_at = now()
    WHERE id = _customer;

  RETURN v_id;
END $$;


ALTER FUNCTION "public"."adjust_loyalty"("_customer" "uuid", "_points" numeric, "_kind" "text", "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_first_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner');
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."bootstrap_first_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase"("_warehouse_id" "uuid", "_supplier_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_invoice_id UUID; v_invoice_no TEXT; v_user UUID := auth.uid();
  v_item JSONB; v_subtotal NUMERIC := 0; v_tax_total NUMERIC := 0; v_total NUMERIC := 0;
  v_qty NUMERIC; v_cost NUMERIC; v_tax_rate NUMERIC; v_line_total NUMERIC; v_line_tax NUMERIC; v_product UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'Warehouse required'; END IF;
  IF _supplier_id IS NULL THEN RAISE EXCEPTION 'Supplier required'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'No items'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := (v_item->>'unit_cost')::NUMERIC;
    v_tax_rate := COALESCE((v_item->>'tax_rate')::NUMERIC, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    v_line_total := v_qty * v_cost;
    v_line_tax := v_line_total * v_tax_rate / 100;
    v_subtotal := v_subtotal + v_line_total;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  v_total := v_subtotal + v_tax_total - COALESCE(_discount,0);
  v_invoice_no := public.next_purchase_number();

  INSERT INTO public.purchase_invoices(invoice_number, supplier_id, warehouse_id, status, subtotal, discount, tax, total, paid, payment_method, note, created_by)
  VALUES (v_invoice_no, _supplier_id, _warehouse_id,
    CASE WHEN COALESCE(_paid,0) >= v_total THEN 'paid'::invoice_status ELSE 'partial'::invoice_status END,
    v_subtotal, COALESCE(_discount,0), v_tax_total, v_total, COALESCE(_paid,0),
    _payment_method::payment_method, _note, v_user)
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := (v_item->>'unit_cost')::NUMERIC;
    v_tax_rate := COALESCE((v_item->>'tax_rate')::NUMERIC, 0);
    v_line_total := v_qty * v_cost;
    v_line_tax := v_line_total * v_tax_rate / 100;
    INSERT INTO public.purchase_invoice_items(invoice_id, product_id, quantity, unit_cost, discount, tax, total)
    VALUES (v_invoice_id, v_product, v_qty, v_cost, 0, v_line_tax, v_line_total + v_line_tax);
    INSERT INTO public.inventory(product_id, warehouse_id, quantity) VALUES (v_product, _warehouse_id, v_qty)
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity, updated_at = now();
    INSERT INTO public.stock_movements(product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, note, created_by)
    VALUES (v_product, _warehouse_id, 'purchase'::movement_type, v_qty, v_cost, 'purchase', v_invoice_id, 'Purchase receipt', v_user);
  END LOOP;

  IF COALESCE(_paid,0) < v_total THEN
    UPDATE public.suppliers SET balance = balance + (v_total - COALESCE(_paid,0)), updated_at = now() WHERE id = _supplier_id;
  END IF;
  RETURN v_invoice_id;
END $$;


ALTER FUNCTION "public"."create_purchase"("_warehouse_id" "uuid", "_supplier_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_supplier_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID; v_no TEXT; v_user UUID := auth.uid();
  v_item JSONB; v_sub NUMERIC := 0; v_tax NUMERIC := 0; v_tot NUMERIC := 0;
  v_qty NUMERIC; v_cost NUMERIC; v_tr NUMERIC; v_lt NUMERIC; v_ltax NUMERIC; v_p UUID; v_stock NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'No items'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    SELECT quantity INTO v_stock FROM public.inventory WHERE product_id=v_p AND warehouse_id=_warehouse_id;
    IF v_stock IS NULL OR v_stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock for product %', v_p; END IF;
    v_cost := (v_item->>'unit_cost')::NUMERIC;
    v_tr := COALESCE((v_item->>'tax_rate')::NUMERIC,0);
    v_lt := v_qty*v_cost; v_ltax := v_lt*v_tr/100;
    v_sub := v_sub+v_lt; v_tax := v_tax+v_ltax;
  END LOOP;
  v_tot := v_sub+v_tax;
  v_no := public.next_purchase_return_number();

  INSERT INTO public.purchase_returns(return_number,invoice_id,supplier_id,warehouse_id,subtotal,tax,total,refund_method,note,created_by)
  VALUES(v_no,_invoice_id,_supplier_id,_warehouse_id,v_sub,v_tax,v_tot,_refund_method::payment_method,_note,v_user)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_cost := (v_item->>'unit_cost')::NUMERIC;
    v_tr := COALESCE((v_item->>'tax_rate')::NUMERIC,0);
    v_lt := v_qty*v_cost; v_ltax := v_lt*v_tr/100;
    INSERT INTO public.purchase_return_items(return_id,product_id,quantity,unit_cost,tax,total)
    VALUES(v_id,v_p,v_qty,v_cost,v_ltax,v_lt+v_ltax);
    UPDATE public.inventory SET quantity=quantity-v_qty, updated_at=now() WHERE product_id=v_p AND warehouse_id=_warehouse_id;
    INSERT INTO public.stock_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(v_p,_warehouse_id,'return_out'::movement_type,v_qty,v_cost,'purchase_return',v_id,'Purchase return',v_user);
  END LOOP;

  IF _supplier_id IS NOT NULL THEN
    UPDATE public.suppliers SET balance = GREATEST(balance - v_tot, 0), updated_at=now() WHERE id=_supplier_id;
  END IF;
  RETURN v_id;
END $$;


ALTER FUNCTION "public"."create_purchase_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_supplier_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_user uuid := auth.uid();
  v_line record;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_discount numeric := coalesce(_discount, 0);
  v_total numeric := 0;
  v_paid numeric := 0;
  v_outstanding numeric := 0;
  v_price numeric;
  v_tax_rate numeric;
  v_cost numeric;
  v_stock numeric;
  v_customer_balance numeric;
  v_credit_limit numeric;
  v_line_total numeric;
  v_line_tax numeric;
  v_status public.invoice_status;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to post sales';
  END IF;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
    OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF _payment_method NOT IN ('cash', 'card', 'bank_transfer', 'credit', 'mobile_money') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF coalesce(_paid, 0) < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative';
  END IF;

  -- Aggregate duplicate product lines and lock products/inventory in a stable
  -- order. This protects the stock check from concurrent checkouts.
  FOR v_line IN
    SELECT
      (line ->> 'product_id')::uuid AS product_id,
      sum((line ->> 'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(_items) AS line
    GROUP BY (line ->> 'product_id')::uuid
    ORDER BY (line ->> 'product_id')::uuid
  LOOP
    IF v_line.product_id IS NULL OR v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Every sale line requires a product and a positive quantity';
    END IF;

    SELECT p.sale_price, p.tax_rate, p.cost_price, i.quantity
      INTO v_price, v_tax_rate, v_cost, v_stock
    FROM public.inventory AS i
    JOIN public.products AS p ON p.id = i.product_id
    WHERE i.product_id = v_line.product_id
      AND i.warehouse_id = _warehouse_id
      AND p.is_active = true
    FOR UPDATE OF i, p;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is unavailable in the selected warehouse', v_line.product_id;
    END IF;

    IF v_stock < v_line.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_line.product_id;
    END IF;

    IF v_price < 0 OR v_cost < 0 OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
      RAISE EXCEPTION 'Product % has invalid pricing or tax configuration', v_line.product_id;
    END IF;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_line_tax := round(v_line_total * v_tax_rate / 100, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  v_total := round(v_subtotal + v_tax_total - v_discount, 2);
  IF v_discount > v_subtotal + v_tax_total OR v_total < 0 THEN
    RAISE EXCEPTION 'Discount cannot exceed the invoice amount';
  END IF;

  IF _customer_id IS NOT NULL THEN
    SELECT balance, credit_limit
      INTO v_customer_balance, v_credit_limit
    FROM public.customers
    WHERE id = _customer_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected customer is unavailable';
    END IF;
  END IF;

  -- For cash/card/bank/mobile sales, record only the receivable amount as paid;
  -- any customer tender above the total is change, not revenue or a credit.
  IF _payment_method = 'credit' THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'A customer is required for a credit sale';
    END IF;
    v_paid := least(coalesce(_paid, 0), v_total);
  ELSE
    v_paid := v_total;
  END IF;

  v_outstanding := v_total - v_paid;
  IF v_outstanding > 0 THEN
    IF coalesce(v_customer_balance, 0) + v_outstanding > coalesce(v_credit_limit, 0) THEN
      RAISE EXCEPTION 'Credit limit would be exceeded';
    END IF;
  END IF;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'paid'::public.invoice_status
    WHEN v_paid = 0 THEN 'unpaid'::public.invoice_status
    ELSE 'partial'::public.invoice_status
  END;

  v_invoice_number := public.next_invoice_number();

  INSERT INTO public.sales_invoices (
    invoice_number,
    customer_id,
    warehouse_id,
    status,
    subtotal,
    discount,
    tax,
    total,
    paid,
    payment_method,
    note,
    created_by
  )
  VALUES (
    v_invoice_number,
    _customer_id,
    _warehouse_id,
    v_status,
    v_subtotal,
    v_discount,
    v_tax_total,
    v_total,
    v_paid,
    _payment_method::public.payment_method,
    nullif(trim(_note), ''),
    v_user
  )
  RETURNING id INTO v_invoice_id;

  -- Re-read the authoritative product snapshot while the row remains locked;
  -- prices and tax rates supplied by the browser are intentionally ignored.
  FOR v_line IN
    SELECT
      (line ->> 'product_id')::uuid AS product_id,
      sum((line ->> 'quantity')::numeric) AS quantity
    FROM jsonb_array_elements(_items) AS line
    GROUP BY (line ->> 'product_id')::uuid
    ORDER BY (line ->> 'product_id')::uuid
  LOOP
    SELECT sale_price, tax_rate, cost_price
      INTO v_price, v_tax_rate, v_cost
    FROM public.products
    WHERE id = v_line.product_id;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_line_tax := round(v_line_total * v_tax_rate / 100, 2);

    INSERT INTO public.sales_invoice_items (
      invoice_id, product_id, quantity, unit_price, discount, tax, total
    )
    VALUES (
      v_invoice_id, v_line.product_id, v_line.quantity, v_price, 0, v_line_tax, v_line_total + v_line_tax
    );

    UPDATE public.inventory
    SET quantity = quantity - v_line.quantity,
        updated_at = now()
    WHERE product_id = v_line.product_id
      AND warehouse_id = _warehouse_id
      AND quantity >= v_line.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock changed while posting sale for product %', v_line.product_id;
    END IF;

    INSERT INTO public.stock_movements (
      product_id, warehouse_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, note, created_by
    )
    VALUES (
      v_line.product_id, _warehouse_id, 'sale'::public.movement_type,
      v_line.quantity, v_cost, 'sale', v_invoice_id, 'POS sale', v_user
    );
  END LOOP;

  IF v_outstanding > 0 THEN
    UPDATE public.customers
    SET balance = balance + v_outstanding,
        updated_at = now()
    WHERE id = _customer_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user,
    'sale.posted',
    'sales_invoice',
    v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'warehouse_id', _warehouse_id,
      'customer_id', _customer_id,
      'payment_method', _payment_method,
      'total', v_total,
      'paid', v_paid,
      'outstanding', v_outstanding
    )
  );

  RETURN v_invoice_id;
END;
$$;


ALTER FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_invoice_id uuid;
  v_base_items jsonb;
  v_service record;
  v_service_total numeric := 0;
  v_generic_id uuid;
  v_has_products boolean;
  v_paid numeric;
  v_total numeric;
  v_final_paid numeric;
  v_balance numeric;
  v_limit numeric;
  v_balance_adjustment numeric;
  v_outstanding numeric;
BEGIN
  IF coalesce(jsonb_typeof(_items), '') <> 'array'
    OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
  IF _sale_date IS NULL THEN
    RAISE EXCEPTION 'Sale date is required';
  END IF;

  SELECT
    coalesce(jsonb_agg(x.value), '[]'::jsonb),
    count(*) > 0
  INTO v_base_items, v_has_products
  FROM jsonb_array_elements(_items) AS x
  WHERE coalesce(x.value->>'is_service', 'false') <> 'true';

  SELECT id
  INTO v_generic_id
  FROM public.products
  WHERE sku = 'SERVICE-CUSTOM';

  IF NOT v_has_products THEN
    v_base_items := jsonb_build_array(
      jsonb_build_object(
        'product_id', v_generic_id,
        'quantity', 1,
        'unit_price', 0,
        'tax_rate', 0
      )
    );
  END IF;

  -- Preserve the existing secure posting path for stock and invoice creation.
  v_invoice_id := public.create_sale(
    _warehouse_id,
    _customer_id,
    _payment_method,
    _paid,
    _discount,
    _note,
    v_base_items
  );

  IF NOT v_has_products THEN
    DELETE FROM public.sales_invoice_items
    WHERE invoice_id = v_invoice_id AND product_id = v_generic_id;

    DELETE FROM public.stock_movements
    WHERE reference_id = v_invoice_id AND product_id = v_generic_id;

    UPDATE public.inventory
    SET quantity = quantity + 1
    WHERE warehouse_id = _warehouse_id AND product_id = v_generic_id;
  END IF;

  FOR v_service IN
    SELECT value
    FROM jsonb_array_elements(_items)
    WHERE coalesce(value->>'is_service', 'false') = 'true'
  LOOP
    IF coalesce(trim(v_service.value->>'name'), '') = ''
      OR coalesce((v_service.value->>'quantity')::numeric, 0) <= 0
      OR coalesce((v_service.value->>'unit_price')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Every service requires a name, price, and positive quantity';
    END IF;

    v_service_total := v_service_total + round(
      (v_service.value->>'quantity')::numeric
      * (v_service.value->>'unit_price')::numeric
      * (1 + coalesce((v_service.value->>'tax_rate')::numeric, 0) / 100),
      2
    );

    INSERT INTO public.sales_invoice_items (
      invoice_id,
      product_id,
      description,
      quantity,
      unit_price,
      discount,
      tax,
      total
    )
    VALUES (
      v_invoice_id,
      NULL,
      nullif(trim(v_service.value->>'name'), ''),
      (v_service.value->>'quantity')::numeric,
      (v_service.value->>'unit_price')::numeric,
      0,
      round(
        (v_service.value->>'quantity')::numeric
        * (v_service.value->>'unit_price')::numeric
        * coalesce((v_service.value->>'tax_rate')::numeric, 0) / 100,
        2
      ),
      round(
        (v_service.value->>'quantity')::numeric
        * (v_service.value->>'unit_price')::numeric
        * (1 + coalesce((v_service.value->>'tax_rate')::numeric, 0) / 100),
        2
      )
    );
  END LOOP;

  SELECT total, paid
  INTO v_total, v_paid
  FROM public.sales_invoices
  WHERE id = v_invoice_id
  FOR UPDATE;

  IF v_service_total > 0 THEN
    IF _payment_method = 'credit' THEN
      v_final_paid := least(coalesce(_paid, 0), v_total + v_service_total);
      v_balance_adjustment := round(
        (v_total + v_service_total - v_final_paid)
        - greatest(v_total - v_paid, 0),
        2
      );

      SELECT balance, credit_limit
      INTO v_balance, v_limit
      FROM public.customers
      WHERE id = _customer_id
      FOR UPDATE;

      IF coalesce(v_balance, 0) + v_balance_adjustment > coalesce(v_limit, 0)
        AND coalesce(v_limit, 0) > 0 THEN
        RAISE EXCEPTION 'Credit limit exceeded';
      END IF;
    ELSE
      v_final_paid := least(coalesce(_paid, 0), v_total + v_service_total);
    END IF;
  END IF;

  v_total := round(v_total + v_service_total, 2);
  v_final_paid := least(greatest(coalesce(_paid, 0), 0), v_total);
  v_outstanding := round(greatest(v_total - v_final_paid, 0), 2);

  IF v_outstanding > 0 AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required when the sale has an unpaid amount';
  END IF;

  IF v_outstanding > 0
    AND NOT public.customer_credit_limit_allows(_customer_id, v_outstanding) THEN
    RAISE EXCEPTION
      'Credit limit exceeded: current balance %, requested debt %, limit %',
      v_balance,
      v_outstanding,
      v_limit;
  END IF;

  UPDATE public.sales_invoices
  SET total = v_total,
      subtotal = round(subtotal + v_service_total, 2),
      paid = v_final_paid,
      status = CASE
        WHEN v_final_paid >= v_total THEN 'paid'::public.invoice_status
        WHEN v_final_paid = 0 THEN 'unpaid'::public.invoice_status
        ELSE 'partial'::public.invoice_status
      END,
      created_at = _sale_date::timestamp + localtime,
      updated_at = now()
  WHERE id = v_invoice_id;

  IF _customer_id IS NOT NULL AND v_service_total > 0 AND v_outstanding > 0 THEN
    UPDATE public.customers
    SET balance = round(
      coalesce(balance, 0)
      + v_outstanding
      - greatest(v_total - v_paid, 0),
      2
    ),
    updated_at = now()
    WHERE id = _customer_id;
  END IF;

  -- The one authoritative posting for the final outstanding amount.
  -- source_key makes retries and replays safe without touching existing rows.
  IF _customer_id IS NOT NULL AND v_outstanding > 0 THEN
    INSERT INTO public.customer_ledger (
      customer_id,
      entry_type,
      debit,
      credit,
      reference_id,
      reference_type,
      occurred_at,
      created_by,
      source_key,
      note
    )
    VALUES (
      _customer_id,
      'sale',
      v_outstanding,
      0,
      v_invoice_id,
      'sales_invoice',
      _sale_date::timestamp + localtime,
      auth.uid(),
      'sale:' || v_invoice_id,
      'قيد بيع آجل'
    )
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  UPDATE public.stock_movements
  SET created_at = _sale_date::timestamp + localtime
  WHERE reference_id = v_invoice_id AND reference_type = 'sale';

  RETURN v_invoice_id;
END;
$$;


ALTER FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") IS 'Posts sales through the existing secure flow and appends one idempotent customer_ledger sale entry for the final outstanding amount. Does not modify existing source documents.';



CREATE OR REPLACE FUNCTION "public"."create_sales_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_customer_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID; v_no TEXT; v_user UUID := auth.uid();
  v_item JSONB; v_sub NUMERIC := 0; v_tax NUMERIC := 0; v_tot NUMERIC := 0;
  v_qty NUMERIC; v_price NUMERIC; v_tr NUMERIC; v_lt NUMERIC; v_ltax NUMERIC; v_p UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'No items'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_tr := COALESCE((v_item->>'tax_rate')::NUMERIC,0);
    v_lt := v_qty*v_price; v_ltax := v_lt*v_tr/100;
    v_sub := v_sub+v_lt; v_tax := v_tax+v_ltax;
  END LOOP;
  v_tot := v_sub+v_tax;
  v_no := public.next_sales_return_number();

  INSERT INTO public.sales_returns(return_number,invoice_id,customer_id,warehouse_id,subtotal,tax,total,refund_method,note,created_by)
  VALUES(v_no,_invoice_id,_customer_id,_warehouse_id,v_sub,v_tax,v_tot,_refund_method::payment_method,_note,v_user)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_price := (v_item->>'unit_price')::NUMERIC;
    v_tr := COALESCE((v_item->>'tax_rate')::NUMERIC,0);
    v_lt := v_qty*v_price; v_ltax := v_lt*v_tr/100;
    INSERT INTO public.sales_return_items(return_id,product_id,quantity,unit_price,tax,total)
    VALUES(v_id,v_p,v_qty,v_price,v_ltax,v_lt+v_ltax);
    INSERT INTO public.inventory(product_id,warehouse_id,quantity) VALUES(v_p,_warehouse_id,v_qty)
    ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity, updated_at=now();
    INSERT INTO public.stock_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(v_p,_warehouse_id,'return_in'::movement_type,v_qty,v_price,'sales_return',v_id,'Sales return',v_user);
  END LOOP;

  IF _customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance = GREATEST(balance - v_tot, 0), updated_at=now() WHERE id=_customer_id;
  END IF;
  RETURN v_id;
END $$;


ALTER FUNCTION "public"."create_sales_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_customer_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_stock_transfer"("_from" "uuid", "_to" "uuid", "_note" "text", "_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id UUID; v_no TEXT; v_user UUID := auth.uid();
  v_item JSONB; v_p UUID; v_qty NUMERIC; v_stock NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'Source and destination must differ'; END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'No items'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    SELECT quantity INTO v_stock FROM public.inventory WHERE product_id=v_p AND warehouse_id=_from;
    IF v_stock IS NULL OR v_stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock for product %', v_p; END IF;
  END LOOP;

  v_no := public.next_transfer_number();
  INSERT INTO public.stock_transfers(transfer_number,from_warehouse_id,to_warehouse_id,note,created_by)
  VALUES(v_no,_from,_to,_note,v_user) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;
    INSERT INTO public.stock_transfer_items(transfer_id,product_id,quantity) VALUES(v_id,v_p,v_qty);
    UPDATE public.inventory SET quantity=quantity-v_qty, updated_at=now() WHERE product_id=v_p AND warehouse_id=_from;
    INSERT INTO public.inventory(product_id,warehouse_id,quantity) VALUES(v_p,_to,v_qty)
    ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity, updated_at=now();
    INSERT INTO public.stock_movements(product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES(v_p,_from,'transfer_out'::movement_type,v_qty,'transfer',v_id,'Transfer out',v_user);
    INSERT INTO public.stock_movements(product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES(v_p,_to,'transfer_in'::movement_type,v_qty,'transfer',v_id,'Transfer in',v_user);
  END LOOP;

  RETURN v_id;
END $$;


ALTER FUNCTION "public"."create_stock_transfer"("_from" "uuid", "_to" "uuid", "_note" "text", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_credit_limit_allows"("p_customer_id" "uuid", "p_new_due" numeric) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers AS c
    CROSS JOIN public.company_settings AS s
    WHERE c.id = p_customer_id
      AND (
        NOT s.enforce_customer_credit_limit
        OR coalesce(c.credit_limit, 0) = 0
        OR coalesce(c.balance, 0) + greatest(coalesce(p_new_due, 0), 0) <= c.credit_limit
      )
  )
$$;


ALTER FUNCTION "public"."customer_credit_limit_allows"("p_customer_id" "uuid", "p_new_due" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_ledger_balance"("p_customer_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT round(coalesce(sum(l.debit - l.credit), 0), 2)
  FROM public.customer_ledger AS l
  WHERE l.customer_id = p_customer_id
$$;


ALTER FUNCTION "public"."customer_ledger_balance"("p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_superadmin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id AND role IN ('superadmin', 'admin') AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_platform_superadmin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;


ALTER FUNCTION "public"."is_staff"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  prefix TEXT;
  n BIGINT;
BEGIN
  SELECT COALESCE(invoice_prefix, 'INV') INTO prefix FROM public.company_settings ORDER BY id LIMIT 1;
  IF prefix IS NULL THEN prefix := 'INV'; END IF;
  n := nextval('public.sales_invoice_seq');
  RETURN prefix || '-' || to_char(now(),'YYYYMM') || '-' || lpad(n::TEXT, 4, '0');
END $$;


ALTER FUNCTION "public"."next_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_purchase_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n BIGINT;
BEGIN
  n := nextval('public.purchase_invoice_seq');
  RETURN 'PO-' || to_char(now(),'YYYYMM') || '-' || lpad(n::TEXT, 4, '0');
END $$;


ALTER FUNCTION "public"."next_purchase_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_purchase_return_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n BIGINT; BEGIN n := nextval('public.purchase_return_seq'); RETURN 'PR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $$;


ALTER FUNCTION "public"."next_purchase_return_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_sales_return_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n BIGINT; BEGIN n := nextval('public.sales_return_seq'); RETURN 'SR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $$;


ALTER FUNCTION "public"."next_sales_return_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_transfer_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n BIGINT; BEGIN n := nextval('public.stock_transfer_seq'); RETURN 'TR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $$;


ALTER FUNCTION "public"."next_transfer_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_counts jsonb;
  v_blocking bigint;
BEGIN
  -- Permission check: only owner/manager may hard-delete a product.
  IF NOT (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'forbidden');
  END IF;

  v_counts   := public.product_reference_counts(p_product_id);
  v_blocking := COALESCE((v_counts ->> 'blocking_total')::bigint, 0);

  IF v_blocking > 0 THEN
    -- Referenced by history -> never delete. The UI offers deactivation instead.
    RETURN jsonb_build_object(
      'deleted', false,
      'reason',  'referenced',
      'counts',  v_counts
    );
  END IF;

  -- Not referenced by any document or movement: safe to remove.
  -- Clean the pure-catalog satellites that carry no financial meaning.
  BEGIN
    DELETE FROM public.product_compatibilities WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  DELETE FROM public.inventory WHERE product_id = p_product_id;

  DELETE FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'reason',  'deleted',
    'counts',  v_counts
  );
END;
$$;


ALTER FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") IS 'Hard-deletes a product ONLY when no invoice, return, transfer or stock movement references it. Otherwise returns reason=referenced so the caller can offer deactivation.';



CREATE OR REPLACE FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sales_items      bigint := 0;
  v_purchase_items   bigint := 0;
  v_sales_returns    bigint := 0;
  v_purchase_returns bigint := 0;
  v_transfers        bigint := 0;
  v_stock_movements  bigint := 0;
  v_inventory_rows   bigint := 0;
  v_compatibilities  bigint := 0;
  v_blocking         bigint := 0;
BEGIN
  -- Historical / financial documents: these MUST block deletion.
  SELECT count(*) INTO v_sales_items
    FROM public.sales_invoice_items WHERE product_id = p_product_id;

  SELECT count(*) INTO v_purchase_items
    FROM public.purchase_invoice_items WHERE product_id = p_product_id;

  -- Returns and transfers are guarded dynamically: some deployments have these
  -- tables, older ones do not. Missing tables count as zero.
  BEGIN
    SELECT count(*) INTO v_sales_returns
      FROM public.sales_return_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_sales_returns := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_purchase_returns
      FROM public.purchase_return_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_purchase_returns := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_transfers
      FROM public.stock_transfer_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_transfers := 0;
  END;

  -- Audit trail: destroying this loses the product's stock history.
  SELECT count(*) INTO v_stock_movements
    FROM public.stock_movements WHERE product_id = p_product_id;

  SELECT count(*) INTO v_inventory_rows
    FROM public.inventory WHERE product_id = p_product_id;

  BEGIN
    SELECT count(*) INTO v_compatibilities
      FROM public.product_compatibilities WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_compatibilities := 0;
  END;

  v_blocking := v_sales_items + v_purchase_items + v_sales_returns
              + v_purchase_returns + v_transfers + v_stock_movements;

  RETURN jsonb_build_object(
    'product_id',          p_product_id,
    'sales_items',         v_sales_items,
    'purchase_items',      v_purchase_items,
    'sales_returns',       v_sales_returns,
    'purchase_returns',    v_purchase_returns,
    'transfers',           v_transfers,
    'stock_movements',     v_stock_movements,
    'inventory_rows',      v_inventory_rows,
    'compatibilities',     v_compatibilities,
    'blocking_total',      v_blocking,
    'can_delete',          v_blocking = 0,
    'has_history',         v_stock_movements > 0 OR v_inventory_rows > 0
  );
END;
$$;


ALTER FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") IS 'Read-only. Reports how many documents/movements reference a product, so the UI can offer deactivate-instead-of-delete. Does not modify anything.';



CREATE OR REPLACE FUNCTION "public"."record_customer_payment"("_customer_id" "uuid", "_invoice_id" "uuid", "_amount" numeric, "_method" "text", "_payment_date" "date", "_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_invoice record;
  v_customer_balance numeric;
  v_remaining numeric := coalesce(_amount, 0);
  v_allocation numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'accountant')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to record customer payments';
  END IF;

  IF _customer_id IS NULL OR v_remaining <= 0 THEN
    RAISE EXCEPTION 'A customer and a positive amount are required';
  END IF;

  IF _method NOT IN ('cash', 'card', 'bank_transfer', 'mobile_money') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  SELECT balance
    INTO v_customer_balance
  FROM public.customers
  WHERE id = _customer_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer is unavailable';
  END IF;

  IF coalesce(v_customer_balance, 0) < v_remaining THEN
    RAISE EXCEPTION 'Customer balance reconciliation is required before recording this payment';
  END IF;

  IF _invoice_id IS NOT NULL THEN
    SELECT id, total, paid, customer_id
      INTO v_invoice
    FROM public.sales_invoices
    WHERE id = _invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    IF v_invoice.customer_id IS DISTINCT FROM _customer_id THEN
      RAISE EXCEPTION 'Invoice does not belong to this customer';
    END IF;

    IF v_invoice.total - v_invoice.paid <= 0 THEN
      RAISE EXCEPTION 'Invoice has no outstanding balance';
    END IF;

    IF v_remaining > v_invoice.total - v_invoice.paid THEN
      RAISE EXCEPTION 'Payment exceeds the invoice outstanding balance';
    END IF;

    INSERT INTO public.customer_payments (
      customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
    )
    VALUES (
      _customer_id, _invoice_id, v_remaining, _method::public.payment_method,
      coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
    )
    RETURNING id INTO v_id;

    UPDATE public.sales_invoices
    SET paid = paid + v_remaining,
        status = CASE
          WHEN paid + v_remaining >= total THEN 'paid'::public.invoice_status
          WHEN paid + v_remaining = 0 THEN 'unpaid'::public.invoice_status
          ELSE 'partial'::public.invoice_status
        END,
        updated_at = now()
    WHERE id = _invoice_id;
  ELSE
    -- A general customer payment is applied to the oldest outstanding invoices.
    -- This keeps customer balance, invoice status, and payment history aligned.
    FOR v_invoice IN
      SELECT id, total, paid
      FROM public.sales_invoices
      WHERE customer_id = _customer_id
        AND total > paid
        AND status NOT IN ('cancelled'::public.invoice_status, 'returned'::public.invoice_status)
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_allocation := least(v_remaining, v_invoice.total - v_invoice.paid);

      INSERT INTO public.customer_payments (
        customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
      )
      VALUES (
        _customer_id, v_invoice.id, v_allocation, _method::public.payment_method,
        coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
      )
      RETURNING id INTO v_id;

      UPDATE public.sales_invoices
      SET paid = paid + v_allocation,
          status = CASE
            WHEN paid + v_allocation >= total THEN 'paid'::public.invoice_status
            ELSE 'partial'::public.invoice_status
          END,
          updated_at = now()
      WHERE id = v_invoice.id;

      v_remaining := v_remaining - v_allocation;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Payment exceeds the customer outstanding balance';
    END IF;
  END IF;

  UPDATE public.customers
  SET balance = balance - _amount,
      updated_at = now()
  WHERE id = _customer_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user,
    'customer_payment.recorded',
    'customer',
    _customer_id,
    jsonb_build_object(
      'invoice_id', _invoice_id,
      'amount', _amount,
      'method', _method,
      'payment_date', coalesce(_payment_date, current_date)
    )
  );

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."record_customer_payment"("_customer_id" "uuid", "_invoice_id" "uuid", "_amount" numeric, "_method" "text", "_payment_date" "date", "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_products"("p_query" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_brand_id" "uuid" DEFAULT NULL::"uuid", "p_unit_id" "uuid" DEFAULT NULL::"uuid", "p_origin_id" "uuid" DEFAULT NULL::"uuid", "p_active" boolean DEFAULT NULL::boolean, "p_low_stock" boolean DEFAULT NULL::boolean, "p_sort_key" "text" DEFAULT 'created_at'::"text", "p_sort_dir" "text" DEFAULT 'desc'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "name_ar" "text", "sku" "text", "barcode" "text", "sale_price" numeric, "cost_price" numeric, "tax_rate" numeric, "min_stock" numeric, "shelf_location" "text", "origin_id" "uuid", "quality_grade_id" "uuid", "is_active" boolean, "category_id" "uuid", "brand_id" "uuid", "unit_id" "uuid", "created_at" timestamp with time zone, "category_name" "text", "category_name_ar" "text", "brand_name" "text", "brand_name_ar" "text", "unit_short_name" "text", "unit_name_ar" "text", "stock_qty" numeric, "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH filtered AS (
    SELECT
      p.id, p.name, p.name_ar, p.sku, p.barcode,
      p.sale_price, p.cost_price, p.tax_rate, p.min_stock, p.shelf_location,
      p.origin_id, p.quality_grade_id, p.is_active,
      p.category_id, p.brand_id, p.unit_id, p.created_at,
      c.name    AS category_name,
      c.name_ar AS category_name_ar,
      b.name    AS brand_name,
      b.name_ar AS brand_name_ar,
      u.short_name AS unit_short_name,
      u.name_ar    AS unit_name_ar,
      COALESCE((
        SELECT sum(i.quantity) FROM public.inventory i WHERE i.product_id = p.id
      ), 0) AS stock_qty
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands     b ON b.id = p.brand_id
    LEFT JOIN public.units      u ON u.id = p.unit_id
    WHERE
      -- Fuzzy-ish text search: case-insensitive substring across the identity
      -- fields. Uses simple LIKE so it works on any Postgres without extensions.
      (
        p_query IS NULL
        OR btrim(p_query) = ''
        OR p.name        ILIKE '%' || btrim(p_query) || '%'
        OR p.name_ar     ILIKE '%' || btrim(p_query) || '%'
        OR p.sku         ILIKE '%' || btrim(p_query) || '%'
        OR p.barcode     ILIKE '%' || btrim(p_query) || '%'
        OR p.shelf_location ILIKE '%' || btrim(p_query) || '%'
      )
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_brand_id    IS NULL OR p.brand_id    = p_brand_id)
      AND (p_unit_id     IS NULL OR p.unit_id     = p_unit_id)
      AND (p_origin_id   IS NULL OR p.origin_id   = p_origin_id)
      AND (p_active      IS NULL OR p.is_active   = p_active)
  ),
  counted AS (
    SELECT *, count(*) OVER () AS total_count FROM filtered
  )
  SELECT
    id, name, name_ar, sku, barcode,
    sale_price, cost_price, tax_rate, min_stock, shelf_location,
    origin_id, quality_grade_id, is_active,
    category_id, brand_id, unit_id, created_at,
    category_name, category_name_ar, brand_name, brand_name_ar,
    unit_short_name, unit_name_ar,
    stock_qty, total_count
  FROM counted
  WHERE
    p_low_stock IS NULL
    OR (p_low_stock = true  AND stock_qty <= min_stock)
    OR (p_low_stock = false AND stock_qty >  min_stock)
  ORDER BY
    CASE WHEN p_sort_key = 'name'       AND p_sort_dir = 'asc'  THEN COALESCE(name_ar, name) END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'name'       AND p_sort_dir = 'desc' THEN COALESCE(name_ar, name) END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'sku'        AND p_sort_dir = 'asc'  THEN sku END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'sku'        AND p_sort_dir = 'desc' THEN sku END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'sale_price' AND p_sort_dir = 'asc'  THEN sale_price END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'sale_price' AND p_sort_dir = 'desc' THEN sale_price END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'cost_price' AND p_sort_dir = 'asc'  THEN cost_price END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'cost_price' AND p_sort_dir = 'desc' THEN cost_price END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'stock'      AND p_sort_dir = 'asc'  THEN stock_qty END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'stock'      AND p_sort_dir = 'desc' THEN stock_qty END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'created_at' AND p_sort_dir = 'asc'  THEN created_at END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'created_at' AND p_sort_dir = 'desc' THEN created_at END DESC NULLS LAST,
    created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;


ALTER FUNCTION "public"."search_products"("p_query" "text", "p_category_id" "uuid", "p_brand_id" "uuid", "p_unit_id" "uuid", "p_origin_id" "uuid", "p_active" boolean, "p_low_stock" boolean, "p_sort_key" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_products"("p_query" "text", "p_category_id" "uuid", "p_brand_id" "uuid", "p_unit_id" "uuid", "p_origin_id" "uuid", "p_active" boolean, "p_low_stock" boolean, "p_sort_key" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) IS 'Read-only server-side search/filter/sort/pagination for the products list. Returns one page plus total_count. SELECT only — never writes.';



CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inventory  bigint := 0;
  v_movements  bigint := 0;
  v_sales      bigint := 0;
  v_purchases  bigint := 0;
  v_transfers  bigint := 0;
  v_blocking   bigint := 0;
BEGIN
  SELECT count(*) INTO v_inventory FROM public.inventory WHERE warehouse_id = p_warehouse_id;
  SELECT count(*) INTO v_movements FROM public.stock_movements WHERE warehouse_id = p_warehouse_id;

  BEGIN
    SELECT count(*) INTO v_sales FROM public.sales_invoices WHERE warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_column THEN v_sales := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_purchases FROM public.purchase_invoices WHERE warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_column THEN v_purchases := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_transfers FROM public.stock_transfers
      WHERE from_warehouse_id = p_warehouse_id OR to_warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_table THEN v_transfers := 0;
       WHEN undefined_column THEN v_transfers := 0;
  END;

  v_blocking := v_inventory + v_movements + v_sales + v_purchases + v_transfers;

  RETURN jsonb_build_object(
    'warehouse_id',   p_warehouse_id,
    'inventory_rows', v_inventory,
    'stock_movements',v_movements,
    'sales_invoices', v_sales,
    'purchase_invoices', v_purchases,
    'transfers',      v_transfers,
    'blocking_total', v_blocking,
    'can_delete',     v_blocking = 0
  );
END;
$$;


ALTER FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") IS 'Read-only. Reports whether a warehouse is referenced by stock, movements or documents.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_ar" "text"
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text",
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "name" "text" DEFAULT 'My Company'::"text" NOT NULL,
    "legal_name" "text",
    "tax_number" "text",
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "currency_symbol" "text" DEFAULT '$'::"text" NOT NULL,
    "tax_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "logo_url" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "invoice_prefix" "text" DEFAULT 'INV-'::"text" NOT NULL,
    "barcode_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enforce_customer_credit_limit" boolean DEFAULT false NOT NULL,
    "catalog_modules" "jsonb" DEFAULT '{"profile": "spare_parts", "enableUnits": true, "enableBrands": true, "enableOrigins": true, "enableQualityGrades": true, "enableMakesAndModels": true}'::"jsonb" NOT NULL,
    CONSTRAINT "only_one_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_settings"."enforce_customer_credit_limit" IS 'عند false، الحد صفر يعني آجل بلا سقف. عند true، يطبّق السقف على الديون الجديدة.';



COMMENT ON COLUMN "public"."company_settings"."catalog_modules" IS 'إعدادات تفعيل موديولات الفهرسة حسب نوع النشاط التجاري (قطع غيار/بقالة/تجزئة/مخصص)';



CREATE TABLE IF NOT EXISTS "public"."countries_of_origin" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" character(2) NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL
);


ALTER TABLE "public"."countries_of_origin" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "entry_type" "text" NOT NULL,
    "debit" numeric(14,2) DEFAULT 0 NOT NULL,
    "credit" numeric(14,2) DEFAULT 0 NOT NULL,
    "reference_id" "uuid",
    "reference_type" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "note" "text",
    "source_key" "text",
    CONSTRAINT "customer_ledger_check" CHECK ((NOT (("debit" > (0)::numeric) AND ("credit" > (0)::numeric)))),
    CONSTRAINT "customer_ledger_check1" CHECK ((("debit" + "credit") > (0)::numeric)),
    CONSTRAINT "customer_ledger_credit_check" CHECK (("credit" >= (0)::numeric)),
    CONSTRAINT "customer_ledger_debit_check" CHECK (("debit" >= (0)::numeric)),
    CONSTRAINT "customer_ledger_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['sale'::"text", 'payment'::"text", 'return'::"text", 'adjustment'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."customer_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "credit_limit" numeric(14,2) DEFAULT 0 NOT NULL,
    "balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loyalty_points" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "customers_credit_limit_nonnegative" CHECK (("credit_limit" >= (0)::numeric))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."customer_ledger_balances" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "customer_id",
    "c"."name",
    "round"(COALESCE("sum"(("l"."debit" - "l"."credit")), (0)::numeric), 2) AS "ledger_balance",
    "c"."balance" AS "legacy_balance",
    "round"((COALESCE("sum"(("l"."debit" - "l"."credit")), (0)::numeric) - "c"."balance"), 2) AS "difference"
   FROM ("public"."customers" "c"
     LEFT JOIN "public"."customer_ledger" "l" ON (("l"."customer_id" = "c"."id")))
  GROUP BY "c"."id", "c"."name", "c"."balance";


ALTER VIEW "public"."customer_ledger_balances" OWNER TO "postgres";


COMMENT ON VIEW "public"."customer_ledger_balances" IS 'الرصيد المحسوب من دفتر حركة العميل ومقارنة الرصيد القديم.';



CREATE OR REPLACE VIEW "public"."customer_balance_reconciliation" WITH ("security_invoker"='true') AS
 SELECT "customer_id",
    "name",
    "ledger_balance",
    "legacy_balance",
    "difference"
   FROM "public"."customer_ledger_balances"
  WHERE ("difference" <> (0)::numeric);


ALTER VIEW "public"."customer_balance_reconciliation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "invoice_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'cash'::"public"."payment_method" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."customer_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_method" "public"."payment_method" DEFAULT 'cash'::"public"."payment_method" NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "points" numeric NOT NULL,
    "kind" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['earn'::"text", 'redeem'::"text", 'adjust'::"text"])))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "mfa_required" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login" timestamp with time zone,
    CONSTRAINT "platform_admins_role_check" CHECK (("role" = ANY (ARRAY['superadmin'::"text", 'support'::"text"])))
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "target_tenant_id" "text",
    "payload" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_modules" (
    "id" "text" NOT NULL,
    "name" "jsonb" NOT NULL,
    "description" "jsonb",
    "category" "text" NOT NULL,
    "dependencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "nav_items" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "routes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_modules_category_check" CHECK (("category" = ANY (ARRAY['core'::"text", 'module'::"text", 'addon'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."platform_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_plans" (
    "id" "text" NOT NULL,
    "name" "jsonb" NOT NULL,
    "description" "jsonb",
    "modules" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "max_users" integer DEFAULT 1 NOT NULL,
    "max_warehouses" integer DEFAULT 1 NOT NULL,
    "max_products" integer,
    "price_monthly" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "batch_number" "text" NOT NULL,
    "expiry_date" "date",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_compatibilities" (
    "product_id" "uuid" NOT NULL,
    "vehicle_model_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_compatibilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "barcode" "text",
    "name" "text" NOT NULL,
    "name_ar" "text",
    "description" "text",
    "image_url" "text",
    "category_id" "uuid",
    "brand_id" "uuid",
    "unit_id" "uuid",
    "cost_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "sale_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax_rate" numeric(6,3) DEFAULT 0 NOT NULL,
    "min_stock" numeric(14,3) DEFAULT 0 NOT NULL,
    "track_expiry" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shelf_location" "text",
    "is_service" boolean DEFAULT false NOT NULL,
    "origin_id" "uuid",
    "quality_grade_id" "uuid"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "phone" "text",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "theme" "text" DEFAULT 'dark'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "unit_cost" numeric(14,2) NOT NULL,
    "discount" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) NOT NULL
);


ALTER TABLE "public"."purchase_invoice_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."purchase_invoice_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."purchase_invoice_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "supplier_id" "uuid",
    "warehouse_id" "uuid",
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "discount" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "paid" numeric(14,2) DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_return_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit_cost" numeric NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "purchase_return_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."purchase_return_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."purchase_return_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."purchase_return_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_number" "text" NOT NULL,
    "invoice_id" "uuid",
    "supplier_id" "uuid",
    "warehouse_id" "uuid" NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "refund_method" "public"."payment_method",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quality_grades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."quality_grades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "quantity" numeric(14,3) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "discount" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."sales_invoice_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sales_invoice_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sales_invoice_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "customer_id" "uuid",
    "warehouse_id" "uuid",
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "discount" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "paid" numeric(14,2) DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sales_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_return_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "sales_return_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."sales_return_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sales_return_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sales_return_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "return_number" "text" NOT NULL,
    "invoice_id" "uuid",
    "customer_id" "uuid",
    "warehouse_id" "uuid" NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "tax" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "refund_method" "public"."payment_method",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sales_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "movement_type" "public"."movement_type" NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "unit_cost" numeric(14,2),
    "reference" "text",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid"
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_transfer_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transfer_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    CONSTRAINT "stock_transfer_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."stock_transfer_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stock_transfer_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stock_transfer_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transfer_number" "text" NOT NULL,
    "from_warehouse_id" "uuid" NOT NULL,
    "to_warehouse_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_transfers_check" CHECK (("from_warehouse_id" <> "to_warehouse_id"))
);


ALTER TABLE "public"."stock_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "extra_modules" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "disabled_modules" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."tenant_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_ar" "text"
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_makes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text" NOT NULL
);


ALTER TABLE "public"."vehicle_makes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "make_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "name_ar" "text"
);


ALTER TABLE "public"."vehicle_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "address" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name_ar" "text"
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."countries_of_origin"
    ADD CONSTRAINT "countries_of_origin_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."countries_of_origin"
    ADD CONSTRAINT "countries_of_origin_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_ledger"
    ADD CONSTRAINT "customer_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_ledger"
    ADD CONSTRAINT "customer_ledger_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_product_id_warehouse_id_key" UNIQUE ("product_id", "warehouse_id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_modules"
    ADD CONSTRAINT "platform_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_plans"
    ADD CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_product_id_warehouse_id_batch_number_key" UNIQUE ("product_id", "warehouse_id", "batch_number");



ALTER TABLE ONLY "public"."product_compatibilities"
    ADD CONSTRAINT "product_compatibilities_pkey" PRIMARY KEY ("product_id", "vehicle_model_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_barcode_key" UNIQUE ("barcode");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoice_items"
    ADD CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_return_items"
    ADD CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_return_number_key" UNIQUE ("return_number");



ALTER TABLE ONLY "public"."quality_grades"
    ADD CONSTRAINT "quality_grades_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."quality_grades"
    ADD CONSTRAINT "quality_grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_return_items"
    ADD CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_return_number_key" UNIQUE ("return_number");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transfer_items"
    ADD CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_transfer_number_key" UNIQUE ("transfer_number");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_subscriptions"
    ADD CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "uq_platform_admin_user" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."tenant_subscriptions"
    ADD CONSTRAINT "uq_tenant_subscription" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."vehicle_makes"
    ADD CONSTRAINT "vehicle_makes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."vehicle_makes"
    ADD CONSTRAINT "vehicle_makes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_models"
    ADD CONSTRAINT "vehicle_models_make_id_name_key" UNIQUE ("make_id", "name");



ALTER TABLE ONLY "public"."vehicle_models"
    ADD CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE INDEX "customer_ledger_customer_date_idx" ON "public"."customer_ledger" USING "btree" ("customer_id", "occurred_at", "id");



CREATE INDEX "idx_audit_created" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_batches_expiry" ON "public"."product_batches" USING "btree" ("expiry_date") WHERE ("expiry_date" IS NOT NULL);



CREATE INDEX "idx_batches_product" ON "public"."product_batches" USING "btree" ("product_id");



CREATE INDEX "idx_customer_payments_customer" ON "public"."customer_payments" USING "btree" ("customer_id", "payment_date" DESC);



CREATE INDEX "idx_customer_payments_invoice" ON "public"."customer_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_inventory_product" ON "public"."inventory" USING "btree" ("product_id");



CREATE INDEX "idx_inventory_warehouse" ON "public"."inventory" USING "btree" ("warehouse_id");



CREATE INDEX "idx_loyalty_customer" ON "public"."loyalty_transactions" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_purchase_invoice_items_product" ON "public"."purchase_invoice_items" USING "btree" ("product_id");



CREATE INDEX "idx_purchase_return_items_product" ON "public"."purchase_return_items" USING "btree" ("product_id");



CREATE INDEX "idx_sales_invoice_items_product" ON "public"."sales_invoice_items" USING "btree" ("product_id");



CREATE INDEX "idx_sales_return_items_product" ON "public"."sales_return_items" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movements_product" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movements_reference" ON "public"."stock_movements" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_stock_movements_warehouse" ON "public"."stock_movements" USING "btree" ("warehouse_id");



CREATE INDEX "idx_stock_transfer_items_product" ON "public"."stock_transfer_items" USING "btree" ("product_id");



CREATE INDEX "products_name_idx" ON "public"."products" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("name_ar", ''::"text")) || ' '::"text") || COALESCE("sku", ''::"text")) || ' '::"text") || COALESCE("barcode", ''::"text"))));



CREATE OR REPLACE TRIGGER "customers_updated" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "products_updated" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "purchases_updated" BEFORE UPDATE ON "public"."purchase_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "sales_updated" BEFORE UPDATE ON "public"."sales_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_batches_updated_at" BEFORE UPDATE ON "public"."product_batches" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "suppliers_updated" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "tg_expenses_updated" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customer_payments_updated" BEFORE UPDATE ON "public"."customer_payments" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "warehouses_updated" BEFORE UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_ledger"
    ADD CONSTRAINT "customer_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_ledger"
    ADD CONSTRAINT "customer_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_payments"
    ADD CONSTRAINT "customer_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_compatibilities"
    ADD CONSTRAINT "product_compatibilities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_compatibilities"
    ADD CONSTRAINT "product_compatibilities_vehicle_model_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "public"."countries_of_origin"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_quality_grade_id_fkey" FOREIGN KEY ("quality_grade_id") REFERENCES "public"."quality_grades"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_invoice_items"
    ADD CONSTRAINT "purchase_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_invoice_items"
    ADD CONSTRAINT "purchase_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_return_items"
    ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."purchase_return_items"
    ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_returns"
    ADD CONSTRAINT "purchase_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_invoice_items"
    ADD CONSTRAINT "sales_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_invoices"
    ADD CONSTRAINT "sales_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_return_items"
    ADD CONSTRAINT "sales_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sales_return_items"
    ADD CONSTRAINT "sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "public"."sales_returns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_returns"
    ADD CONSTRAINT "sales_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_transfer_items"
    ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."stock_transfer_items"
    ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."tenant_subscriptions"
    ADD CONSTRAINT "tenant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_models"
    ADD CONSTRAINT "vehicle_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE CASCADE;



CREATE POLICY "Owners/managers read audit" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Staff insert audit" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "Staff read batches" ON "public"."product_batches" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "Staff read loyalty" ON "public"."loyalty_transactions" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "Staff write batches" ON "public"."product_batches" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "Staff write loyalty" ON "public"."loyalty_transactions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brand_manage" ON "public"."brands" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "brand_view" ON "public"."brands" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cat_manage" ON "public"."categories" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "cat_view" ON "public"."categories" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company insert" ON "public"."company_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_update" ON "public"."company_settings" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "company_view" ON "public"."company_settings" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."countries_of_origin" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cust_manage" ON "public"."customers" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'cashier'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'cashier'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role")));



CREATE POLICY "cust_view" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."customer_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_ledger_view" ON "public"."customer_ledger" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."customer_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fitment_staff" ON "public"."product_compatibilities" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "inv_manage" ON "public"."inventory" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role")));



CREATE POLICY "inv_view" ON "public"."inventory" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "make_staff" ON "public"."vehicle_makes" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "model_staff" ON "public"."vehicle_models" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "mv_insert" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "mv_view" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "origin_staff" ON "public"."countries_of_origin" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "owner manage roles del" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role"));



CREATE POLICY "owner manage roles ins" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role"));



CREATE POLICY "owner manage roles upd" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role"));



ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_admins_manage" ON "public"."platform_admins" TO "authenticated" USING ("public"."is_platform_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_platform_superadmin"("auth"."uid"()));



CREATE POLICY "platform_admins_select" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."platform_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_audit_logs_insert" ON "public"."platform_audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_platform_admin"("auth"."uid"()) OR ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "platform_audit_logs_select" ON "public"."platform_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"("auth"."uid"()));



ALTER TABLE "public"."platform_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_modules_read" ON "public"."platform_modules" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."platform_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_plans_read" ON "public"."platform_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "prod_manage" ON "public"."products" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role")));



CREATE POLICY "prod_view" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."product_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_compatibilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles read" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "profiles_self_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "pur_item_manage" ON "public"."purchase_invoice_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role")));



CREATE POLICY "pur_item_view" ON "public"."purchase_invoice_items" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "pur_manage" ON "public"."purchase_invoices" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'warehouse'::"public"."app_role")));



CREATE POLICY "pur_view" ON "public"."purchase_invoices" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."purchase_invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_return_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quality_grades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quality_staff" ON "public"."quality_grades" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "roles_self_view" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "sale_item_view" ON "public"."sales_invoice_items" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "sale_view" ON "public"."sales_invoices" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."sales_invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_return_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_returns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff read expense cats" ON "public"."expense_categories" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read expenses" ON "public"."expenses" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read pret" ON "public"."purchase_returns" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read pret_i" ON "public"."purchase_return_items" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read sret" ON "public"."sales_returns" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read sret_i" ON "public"."sales_return_items" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read xfer" ON "public"."stock_transfers" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff read xfer_i" ON "public"."stock_transfer_items" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write expense cats" ON "public"."expense_categories" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write expenses" ON "public"."expenses" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write pret" ON "public"."purchase_returns" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write pret_i" ON "public"."purchase_return_items" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write sret" ON "public"."sales_returns" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write sret_i" ON "public"."sales_return_items" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write xfer" ON "public"."stock_transfers" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff write xfer_i" ON "public"."stock_transfer_items" TO "authenticated" USING ("public"."is_staff"("auth"."uid"())) WITH CHECK ("public"."is_staff"("auth"."uid"()));



CREATE POLICY "staff_view_customer_payments" ON "public"."customer_payments" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_transfer_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supp_manage" ON "public"."suppliers" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'accountant'::"public"."app_role")));



CREATE POLICY "supp_view" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_subscriptions_insert" ON "public"."tenant_subscriptions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "tenant_subscriptions_read" ON "public"."tenant_subscriptions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tenant_subscriptions_select" ON "public"."tenant_subscriptions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tenant_subscriptions_update" ON "public"."tenant_subscriptions" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "unit_manage" ON "public"."units" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "unit_view" ON "public"."units" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));



ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_makes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_models" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wh_manage" ON "public"."warehouses" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'owner'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "wh_view" ON "public"."warehouses" FOR SELECT TO "authenticated" USING ("public"."is_staff"("auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."adjust_loyalty"("_customer" "uuid", "_points" numeric, "_kind" "text", "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_loyalty"("_customer" "uuid", "_points" numeric, "_kind" "text", "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_loyalty"("_customer" "uuid", "_points" numeric, "_kind" "text", "_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_first_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_first_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_purchase"("_warehouse_id" "uuid", "_supplier_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_purchase"("_warehouse_id" "uuid", "_supplier_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase"("_warehouse_id" "uuid", "_supplier_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_purchase_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_supplier_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_purchase_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_supplier_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_supplier_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale"("_warehouse_id" "uuid", "_customer_id" "uuid", "_payment_method" "text", "_paid" numeric, "_discount" numeric, "_note" "text", "_items" "jsonb", "_sale_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_sales_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_customer_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_sales_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_customer_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sales_return"("_invoice_id" "uuid", "_warehouse_id" "uuid", "_customer_id" "uuid", "_refund_method" "text", "_note" "text", "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_stock_transfer"("_from" "uuid", "_to" "uuid", "_note" "text", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_stock_transfer"("_from" "uuid", "_to" "uuid", "_note" "text", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_stock_transfer"("_from" "uuid", "_to" "uuid", "_note" "text", "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_credit_limit_allows"("p_customer_id" "uuid", "p_new_due" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_credit_limit_allows"("p_customer_id" "uuid", "p_new_due" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_credit_limit_allows"("p_customer_id" "uuid", "p_new_due" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_ledger_balance"("p_customer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_ledger_balance"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_ledger_balance"("p_customer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_superadmin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_superadmin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_superadmin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_staff"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_staff"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_staff"("_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."next_invoice_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_invoice_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_purchase_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_purchase_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_purchase_return_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_purchase_return_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_sales_return_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_sales_return_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_transfer_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_transfer_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_delete_guard"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_reference_counts"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_customer_payment"("_customer_id" "uuid", "_invoice_id" "uuid", "_amount" numeric, "_method" "text", "_payment_date" "date", "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_customer_payment"("_customer_id" "uuid", "_invoice_id" "uuid", "_amount" numeric, "_method" "text", "_payment_date" "date", "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_customer_payment"("_customer_id" "uuid", "_invoice_id" "uuid", "_amount" numeric, "_method" "text", "_payment_date" "date", "_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_products"("p_query" "text", "p_category_id" "uuid", "p_brand_id" "uuid", "p_unit_id" "uuid", "p_origin_id" "uuid", "p_active" boolean, "p_low_stock" boolean, "p_sort_key" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_products"("p_query" "text", "p_category_id" "uuid", "p_brand_id" "uuid", "p_unit_id" "uuid", "p_origin_id" "uuid", "p_active" boolean, "p_low_stock" boolean, "p_sort_key" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_products"("p_query" "text", "p_category_id" "uuid", "p_brand_id" "uuid", "p_unit_id" "uuid", "p_origin_id" "uuid", "p_active" boolean, "p_low_stock" boolean, "p_sort_key" "text", "p_sort_dir" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."warehouse_reference_counts"("p_warehouse_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."countries_of_origin" TO "anon";
GRANT ALL ON TABLE "public"."countries_of_origin" TO "authenticated";
GRANT ALL ON TABLE "public"."countries_of_origin" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_ledger" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."customer_ledger_balances" TO "anon";
GRANT ALL ON TABLE "public"."customer_ledger_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_ledger_balances" TO "service_role";



GRANT ALL ON TABLE "public"."customer_balance_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."customer_balance_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_balance_reconciliation" TO "service_role";



GRANT ALL ON TABLE "public"."customer_payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."customer_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_payments" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."platform_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."platform_modules" TO "anon";
GRANT ALL ON TABLE "public"."platform_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_modules" TO "service_role";



GRANT ALL ON TABLE "public"."platform_plans" TO "anon";
GRANT ALL ON TABLE "public"."platform_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_plans" TO "service_role";



GRANT ALL ON TABLE "public"."product_batches" TO "anon";
GRANT ALL ON TABLE "public"."product_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."product_batches" TO "service_role";



GRANT ALL ON TABLE "public"."product_compatibilities" TO "anon";
GRANT ALL ON TABLE "public"."product_compatibilities" TO "authenticated";
GRANT ALL ON TABLE "public"."product_compatibilities" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoice_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_invoice_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_invoice_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_invoice_seq" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoices" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_return_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_return_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_return_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_return_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_return_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_return_seq" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_returns" TO "anon";
GRANT ALL ON TABLE "public"."purchase_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_returns" TO "service_role";



GRANT ALL ON TABLE "public"."quality_grades" TO "anon";
GRANT ALL ON TABLE "public"."quality_grades" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_grades" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoice_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoice_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_invoice_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_invoice_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_invoice_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sales_invoices" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."sales_return_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_return_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_return_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_return_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_return_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_return_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sales_returns" TO "anon";
GRANT ALL ON TABLE "public"."sales_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_returns" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transfer_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_transfer_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_transfer_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_transfer_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_transfer_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_transfer_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transfers" TO "anon";
GRANT ALL ON TABLE "public"."stock_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."tenant_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_makes" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_makes" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_makes" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_models" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_models" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_models" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































