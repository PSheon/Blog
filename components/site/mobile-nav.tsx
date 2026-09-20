"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DrawerProps } from "./mobile-drawer";

const loadDrawer = () => import("./mobile-drawer");
const MobileDrawer = dynamic(loadDrawer, { ssr: false });

/** The phone's menu button. The drawer behind it is fetched the first time it is needed. */
export function MobileNav(props: Omit<DrawerProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={props.t.nav.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => void loadDrawer()}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "cursor-pointer transition-transform active:scale-90")}
      >
        <Menu />
      </button>
      {wanted && <MobileDrawer {...props} open={open} onOpenChange={setOpen} />}
    </>
  );
}
