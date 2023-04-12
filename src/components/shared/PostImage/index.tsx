// ** Next Import
import Image, { StaticImageData } from "next/image";

interface Props {
  src: string | StaticImageData;
  alt: string;
  containerHeight?: string;
}

const PostImage = (props: Props) => {
  // ** Props
  const { src, alt, containerHeight = "12rem" } = props;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: containerHeight,
      }}
    >
      <Image
        fill
        src={src}
        alt={alt}
        draggable={false}
        placeholder="blur"
        style={{ objectFit: "cover" }}
      />
    </div>
  );
};

export default PostImage;
