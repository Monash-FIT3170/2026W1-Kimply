export const Header = () => {
  return (
    <>
      <style>
      @import url('https://fonts.googleapis.com/css2?family=Climate+Crisis:YEAR@1979&family=DynaPuff:wght@400..700&display=swap');
      </style>

      <div style={{
        background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 100%)',
        padding: '0 24px',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{
          fontSize: '52px',
          fontWeight: '700',
          color: 'white',
          letterSpacing: '4px',
          fontFamily: "'DynaPuff', cursive",
        }}>
          Kimply
        </span>
      </div>
    </>
  );
};