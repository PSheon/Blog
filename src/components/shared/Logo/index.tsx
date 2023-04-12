// ** React Imports
import { Fragment } from "react";

// ** Next Import
import Image from "next/image";

// ** Assets
import LOGO_IMG from "src/assets/images/shared/PSheon.png";

interface Props {
  width?: number;
  height?: number;
}

const Logo = (props: Props) => {
  // ** Props
  const { width = 20, height = 20 } = props;

  return (
    <Fragment>
      <Image width={width} height={height} src={LOGO_IMG} alt="logo" />;
      <span style={{ marginLeft: ".4em", fontWeight: 800 }}>PSheon's Blog</span>
    </Fragment>
  );
};

export default Logo;
