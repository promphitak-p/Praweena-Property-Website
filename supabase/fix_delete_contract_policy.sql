-- Ensure DELETE is explicitly allowed for Admins
DROP POLICY IF EXISTS "contracts_delete_staff" ON public.contracts;

CREATE POLICY "contracts_delete_staff" ON public.contracts
FOR DELETE
USING ( public.is_admin() );

-- Also re-verify SELECT/ALL logic just in case
DROP POLICY IF EXISTS "contracts_crud_staff" ON public.contracts;
CREATE POLICY "contracts_crud_staff" ON public.contracts
FOR ALL
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );
